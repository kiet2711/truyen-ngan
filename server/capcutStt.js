/**
 * CapCut Speech-to-Text (STT) Service - Node.js Backend
 * Chuyển đổi âm thanh / video thành phụ đề chuẩn SRT và văn bản chi tiết qua CapCut Cloud API
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE_URL = "https://editor-api-sg.capcutapi.com";
const VOD_REGION = "sdwdmwlll";
const VOD_SERVICE = "vod";

const DEFAULT_DEVICE = {
  aid: "359289",
  app_name: "CapCut",
  appvr: "8.7.0",
  version_name: "8.7.0",
  version_code: "8.7.0",
  channel: "capcutpc_google",
  device_platform: "mac",
  device_type: "MacBookPro17,4",
  device_brand: "MacBookPro17,4",
  os_version: "15.7.4",
  device_id: "76471456455646328721",
  iid: "76471456455646328721",
  region: "VN",
  loc: "VN",
  lan: "vi-VN",
  pf: "3",
  tdid: "76471456455646328721",
};

// CRC32 Lookup Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32Hex(buffer) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function aws4SigningKey(secretAccessKey, dateStamp, region = VOD_REGION, service = VOD_SERVICE) {
  const kDate = hmacSha256("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function utcNowForVod() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const amzDate = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const httpDate = now.toUTCString();
  return { amzDate, httpDate };
}

function makeSignHeader(urlStr, appvr, deviceTime, tdid) {
  const parsed = new URL(urlStr);
  const path = parsed.pathname;
  const signStr = `9e2c|${path.slice(-7)}|3|${appvr}|${deviceTime}|${tdid}|11ac`;
  return md5Hex(signStr);
}

function makeTraceId() {
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function getRandomDevice() {
  const dev = { ...DEFAULT_DEVICE };
  const randomId = String(Math.floor(1000000000000000000 + Math.random() * 9000000000000000000));
  dev.device_id = randomId;
  dev.iid = randomId;
  dev.tdid = randomId;
  return dev;
}

function buildBaseHeaders(device, bodyText, appid = false) {
  const now = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "appvr": device.appvr,
    "ch": device.channel,
    "device-time": now,
    "lan": device.lan,
    "loc": device.loc,
    "pf": device.pf,
    "sign-ver": "1",
    "tdid": device.tdid,
    "x-ss-stub": md5Hex(bodyText),
    "x-ss-dp": device.aid,
    "x-khronos": now,
    "x-tt-trace-id": makeTraceId(),
    "user-agent": "Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03",
    "accept-encoding": "gzip, deflate",
    "store-country-code": device.loc.toLowerCase(),
    "store-country-code-src": "did",
    "is-dispatch-us-ttp": "0",
    "is-app-region-us-ttp": "0",
  };
  if (appid) {
    headers["app-sdk-version"] = device.appvr;
    headers["appid"] = device.aid;
  }
  return headers;
}

function buildCommonQuery(device, babiParam = null, includeRegion = true) {
  const q = {
    app_name: device.app_name,
    device_type: device.device_type,
    os_version: device.os_version,
    channel: device.channel,
    version_name: device.version_name,
    device_brand: device.device_brand,
    device_id: device.device_id,
    iid: device.iid,
    version_code: device.version_code,
    device_platform: device.device_platform,
    aid: device.aid,
  };
  if (includeRegion) q.region = device.region;
  if (babiParam) q.babi_param = JSON.stringify(babiParam);
  return q;
}

function canonicalQuery(urlStr) {
  const parsed = new URL(urlStr);
  const pairs = [];
  parsed.searchParams.forEach((val, key) => pairs.push([key, val]));
  // Strict ASCII sorting for AWS SigV4 specification
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0)));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function aws4Authorization(method, urlStr, bodyBuf, accessKeyId, secretAccessKey, sessionToken, amzDate) {
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${VOD_REGION}/${VOD_SERVICE}/aws4_request`;
  const signedHeaders = "x-amz-date;x-amz-security-token";
  const canonicalHeaders = `x-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`;

  const parsed = new URL(urlStr);
  const q = canonicalQuery(urlStr);

  const payloadHash = sha256Hex(bodyBuf);
  const canonicalRequest = [method, parsed.pathname, q, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = aws4SigningKey(secretAccessKey, dateStamp);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Upload buffer to CapCut VOD Space
 */
async function uploadToVod(buffer, device) {
  const localMd5 = md5Hex(buffer);

  // 1. Upload Sign Request
  const signBody = JSON.stringify({ biz: "cc_pc_text_recognize", key_version: "v5" });
  const signQuery = buildCommonQuery(device, null, false);
  const signUrl = `${BASE_URL}/lv/v1/upload_sign?${new URLSearchParams(signQuery).toString()}`;
  const signHeaders = buildBaseHeaders(device, signBody, true);
  signHeaders["sign"] = makeSignHeader(signUrl, device.appvr, signHeaders["device-time"], device.tdid);

  const signResp = await fetch(signUrl, {
    method: "POST",
    headers: signHeaders,
    body: signBody
  });

  const signData = await signResp.json();
  if (signData.status_code !== 0 && signData.ret !== "0") {
    throw new Error(`Upload sign failed: ${JSON.stringify(signData)}`);
  }

  const creds = signData.data || {};
  for (const key of ["domain", "access_key_id", "secret_access_key", "session_token", "space_name"]) {
    if (!creds[key]) throw new Error(`upload_sign missing field '${key}'`);
  }

  // 2. ApplyUploadInner
  const applyQuery = {
    Action: "ApplyUploadInner",
    SpaceName: creds.space_name,
    UseQuic: "false",
    Version: "2020-11-19",
    device_platform: "win",
  };
  const applyUrl = `https://${creds.domain}/top/v1?${new URLSearchParams(applyQuery).toString()}`;
  const { amzDate: applyAmzDate, httpDate: applyHttpDate } = utcNowForVod();
  const applyAuth = aws4Authorization("GET", applyUrl, Buffer.alloc(0), creds.access_key_id, creds.secret_access_key, creds.session_token, applyAmzDate);

  const applyHeaders = {
    "Authorization": applyAuth,
    "Date": applyHttpDate,
    "User-Agent": `BDFileUpload(${Date.now()})`,
    "X-Amz-Date": applyAmzDate,
    "X-Amz-Expires": "31536000",
    "X-Amz-Security-Token": creds.session_token,
    "accept-encoding": "identity",
    "store-country-code": device.loc.toLowerCase(),
    "store-country-code-src": "did",
    "is-dispatch-us-ttp": "0",
    "is-app-region-us-ttp": "0",
    "tdid": device.tdid,
    "pf": device.pf,
  };

  const applyResp = await fetch(applyUrl, { method: "GET", headers: applyHeaders });
  const applyData = await applyResp.json();
  if (!applyData.Result || !applyData.Result.InnerUploadAddress) {
    throw new Error(`ApplyUploadInner failed: ${JSON.stringify(applyData)}`);
  }

  const node = applyData.Result.InnerUploadAddress.UploadNodes[0];
  const store = node.StoreInfos[0];
  const uploadHost = node.UploadHost;
  const storeUri = store.StoreUri;
  const uploadId = store.UploadID;
  const uploadAuth = store.Auth;
  const vid = node.Vid || (node.Vids && node.Vids[0]) || null;

  // 3. Transfer binary in 5MB chunks
  const chunkSize = 5 * 1024 * 1024;
  const chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    chunks.push(buffer.subarray(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push(Buffer.alloc(0));

  const partCrcs = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkCrc = crc32Hex(chunk);
    partCrcs.push(`${i}:${chunkCrc}`);

    const transferUrl = `https://${uploadHost}/upload/v1/${storeUri}?uploadid=${uploadId}&part_number=${i}&phase=transfer`;
    const transferHeaders = {
      "Authorization": uploadAuth,
      "Date": utcNowForVod().httpDate,
      "User-Agent": `BDFileUpload(${Date.now()})`,
      "accept-encoding": "identity",
      "store-country-code": device.loc.toLowerCase(),
      "store-country-code-src": "did",
      "is-dispatch-us-ttp": "0",
      "is-app-region-us-ttp": "0",
      "tdid": device.tdid,
      "pf": device.pf,
      "X-Upload-Content-CRC32": chunkCrc,
    };

    const transferResp = await fetch(transferUrl, { method: "POST", headers: transferHeaders, body: chunk });
    const transferData = await transferResp.json();
    if (transferData.error) {
      throw new Error(`Transfer chunk ${i} failed: ${JSON.stringify(transferData)}`);
    }
  }

  // 4. Finish Upload
  const finishUrl = `https://${uploadHost}/upload/v1/${storeUri}?uploadmode=part&phase=finish&uploadid=${uploadId}`;
  const finishBody = partCrcs.join(',');
  const finishHeaders = {
    "Authorization": uploadAuth,
    "Date": utcNowForVod().httpDate,
    "User-Agent": `BDFileUpload(${Date.now()})`,
    "accept-encoding": "identity",
    "store-country-code": device.loc.toLowerCase(),
    "store-country-code-src": "did",
    "is-dispatch-us-ttp": "0",
    "is-app-region-us-ttp": "0",
    "tdid": device.tdid,
    "pf": device.pf,
  };

  const finishResp = await fetch(finishUrl, { method: "POST", headers: finishHeaders, body: finishBody });
  const finishData = await finishResp.json();
  if (finishData.error) {
    throw new Error(`Finish upload failed: ${JSON.stringify(finishData)}`);
  }

  // 5. CommitUploadInner
  const commitUrl = `https://${creds.domain}/top/v1?Action=CommitUploadInner&SpaceName=${creds.space_name}&Version=2020-11-19&device_platform=win`;
  const commitBodyObj = {
    Functions: [{ Input: { SnapshotTime: 0.0 }, Name: "Snapshot" }],
    SessionKey: node.SessionKey
  };
  const commitBody = JSON.stringify(commitBodyObj);
  const { amzDate: commitAmzDate, httpDate: commitHttpDate } = utcNowForVod();
  const commitAuth = aws4Authorization("POST", commitUrl, Buffer.from(commitBody), creds.access_key_id, creds.secret_access_key, creds.session_token, commitAmzDate);

  const commitHeaders = {
    "Authorization": commitAuth,
    "Date": commitHttpDate,
    "User-Agent": `BDFileUpload(${Date.now()})`,
    "X-Amz-Date": commitAmzDate,
    "X-Amz-Expires": "31536000",
    "X-Amz-Security-Token": creds.session_token,
    "accept-encoding": "identity",
    "store-country-code": device.loc.toLowerCase(),
    "store-country-code-src": "did",
    "is-dispatch-us-ttp": "0",
    "is-app-region-us-ttp": "0",
    "tdid": device.tdid,
    "pf": device.pf,
    "content-type": "application/json",
  };

  const commitResp = await fetch(commitUrl, { method: "POST", headers: commitHeaders, body: commitBody });
  const commitData = await commitResp.json();
  if (!commitData.Result || !commitData.Result.Results) {
    throw new Error(`CommitUploadInner failed: ${JSON.stringify(commitData)}`);
  }

  const resResult = commitData.Result.Results[0];
  const meta = resResult.VideoMeta || {};
  const durationMs = meta.Duration ? Math.round(parseFloat(meta.Duration) * 1000) : 10000;

  return {
    vid: resResult.Vid || vid,
    md5: meta.Md5 || localMd5,
    localMd5,
    durationMs: durationMs || 10000,
    size: meta.Size || buffer.length,
    storeUri: meta.Uri || storeUri
  };
}

/**
 * Format milliseconds to SRT timestamp: 00:01:23,456
 */
function msToSrtTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

/**
 * Create CapCut STT Task
 */
async function createSttTask(audioVid, audioMd5, durationMs, language = "vi-VN", translationLanguage = "vi-VN", useTranslation = false, device) {
  const babi = {
    feature_entrance: "editor",
    feature_entrance_detail: "editor-elements-captions-subtitle_recognition",
    feature_key: "subtitle_recognition",
    scenario: "video_editor",
  };

  const capJson = {
    adjust_endtime: 200,
    audio: audioVid,
    audio_type: "vid",
    caption_type: 0,
    client_request_id: crypto.randomUUID(),
    duration: parseInt(durationMs, 10) || 10000,
    enable_cache: true,
    enter_from: "asr",
    language: language,
    max_lines: 1,
    md5: audioMd5,
    pack_options: { need_attribute: true },
    songs_info: [
      { end_time: parseFloat(durationMs) - 10.334, id: "", start_time: 0 }
    ],
    translation_language: translationLanguage,
    use_translation: Boolean(useTranslation),
    words_per_line: 15,
  };

  const body = {
    bind_id: crypto.randomUUID().toUpperCase(),
    can_queue: true,
    enter_from: "asr",
    tasks: [
      {
        context: crypto.randomUUID(),
        payload: JSON.stringify({ cap_json: capJson }),
        req_key: "cc_audio_subtitle_asr",
        task_version: "v3",
      }
    ],
  };

  const bodyText = JSON.stringify(body);
  const query = buildCommonQuery(device, babi, true);
  const url = `${BASE_URL}/lv/v1/common_task/new?${new URLSearchParams(query).toString()}`;
  const headers = buildBaseHeaders(device, bodyText, false);
  headers["sign"] = makeSignHeader(url, device.appvr, headers["device-time"], device.tdid);

  const resp = await fetch(url, { method: "POST", headers, body: bodyText });
  const data = await resp.json();
  if (data.status_code !== 0 && data.ret !== "0") {
    throw new Error(`Create STT task failed: ${JSON.stringify(data)}`);
  }

  const tasks = (data.data && data.data.tasks) || [];
  if (tasks.length === 0) throw new Error(`No STT task returned: ${JSON.stringify(data)}`);

  return {
    taskId: tasks[0].id,
    token: tasks[0].token
  };
}

/**
 * Query STT Task
 */
async function querySttTask(taskId, token, device) {
  const body = {
    tasks: [
      {
        bind_id: "",
        id: taskId,
        req_key: "cc_audio_subtitle_asr",
        task_version: "v3",
        token: token,
      }
    ]
  };
  const bodyText = JSON.stringify(body);
  const query = buildCommonQuery(device, null, false);
  const url = `${BASE_URL}/lv/v1/common_task/query?${new URLSearchParams(query).toString()}`;
  const headers = buildBaseHeaders(device, bodyText, false);
  headers["sign"] = makeSignHeader(url, device.appvr, headers["device-time"], device.tdid);

  const resp = await fetch(url, { method: "POST", headers, body: bodyText });
  return await resp.json();
}

/**
 * Transcribe Audio File/Buffer to Subtitles & Text
 */
async function transcribeAudioBuffer(buffer, options = {}, onProgress = null) {
  const {
    language = "vi-VN",
    translationLanguage = "vi-VN",
    useTranslation = false,
    pollInterval = 2500,
    timeoutMs = 600000 // 10 minutes
  } = options;

  const device = getRandomDevice();

  if (onProgress) onProgress({ phase: "uploading", message: "Đang tải file âm thanh lên máy chủ nhận dạng..." });
  const uploadRes = await uploadToVod(buffer, device);

  if (onProgress) onProgress({ phase: "creating_task", message: "Đã tải xong, đang khởi tạo tác vụ nhận diện giọng nói (STT)..." });
  const { taskId, token } = await createSttTask(
    uploadRes.vid,
    uploadRes.md5,
    uploadRes.durationMs,
    language,
    translationLanguage,
    useTranslation,
    device
  );

  const startTime = Date.now();
  let queryRes = null;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, pollInterval));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (onProgress) onProgress({ phase: "polling", elapsed, message: `Máy chủ đang nhận dạng giọng nói... (${elapsed}s)` });

    const q = await querySttTask(taskId, token, device);
    const tasks = (q.data && q.data.tasks) || [];
    if (tasks.length > 0) {
      const status = tasks[0].status;
      if (status === "success" || status === "succeed") {
        queryRes = q;
        break;
      } else if (status === "failed") {
        throw new Error("Máy chủ CapCut báo lỗi nhận dạng (file không chứa giọng nói hợp lệ hoặc âm thanh quá nhỏ).");
      }
    }
  }

  if (!queryRes) {
    throw new Error(`Quá thời gian chờ phản hồi (${Math.round(timeoutMs / 1000)}s).`);
  }

  // Parse payload
  const task = queryRes.data.tasks[0];
  let payload = task.payload || {};
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch (e) {}
  }

  const rawUtterances = payload.utterances || [];
  if (rawUtterances.length === 0) {
    throw new Error("Không tìm thấy giọng nói trong tệp này hoặc API trả về rỗng.");
  }

  const utterances = [];
  const srtParts = [];
  const fullTextParts = [];

  rawUtterances.forEach((ut, idx) => {
    const text = (useTranslation && ut.translation_text) ? ut.translation_text : (ut.text || "");
    const startTime = ut.start_time || 0;
    const endTime = ut.end_time || 0;
    const words = (ut.words || []).map(w => ({
      text: w.text || "",
      startTime: w.start_time || 0,
      endTime: w.end_time || 0
    }));

    utterances.push({
      index: idx + 1,
      startTime,
      endTime,
      startFormatted: msToSrtTime(startTime),
      endFormatted: msToSrtTime(endTime),
      text,
      words
    });

    if (text) {
      fullTextParts.push(text);
      srtParts.push(`${idx + 1}\n${msToSrtTime(startTime)} --> ${msToSrtTime(endTime)}\n${text}\n`);
    }
  });

  return {
    utterances,
    srt: srtParts.join('\n').trim(),
    fullText: fullTextParts.join(' ').trim(),
    durationMs: uploadRes.durationMs,
    language,
    useTranslation,
    totalSentences: utterances.length
  };
}

module.exports = {
  transcribeAudioBuffer,
  uploadToVod,
  createSttTask,
  querySttTask,
  msToSrtTime
};
