/**
 * Vietnamese Number-to-Words & TTS Audio Text Normalizer
 * Chuẩn hóa số, ký hiệu, viết tắt và làm sạch markdown sẵn sàng cho các tool Audio/TTS
 */

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

/**
 * Đọc cụm 3 chữ số (ví dụ: 123 -> một trăm hai mươi ba)
 */
function readThreeDigits(numberStr, isFirstGroup = false) {
  const num = parseInt(numberStr, 10);
  if (num === 0) return isFirstGroup ? "không" : "";

  const hundreds = Math.floor(num / 100);
  const tens = Math.floor((num % 100) / 10);
  const units = num % 10;

  let result = "";

  if (hundreds > 0 || !isFirstGroup) {
    result += DIGITS[hundreds] + " trăm ";
  }

  if (tens === 0 && units !== 0) {
    if (hundreds > 0 || !isFirstGroup) {
      result += "lẻ ";
    }
    result += DIGITS[units];
  } else if (tens === 1) {
    result += "mười ";
    if (units === 1) result += "một";
    else if (units === 5) result += "lăm";
    else if (units !== 0) result += DIGITS[units];
  } else if (tens > 1) {
    result += DIGITS[tens] + " mươi ";
    if (units === 1) result += "mốt";
    else if (units === 4) result += "tư";
    else if (units === 5) result += "lăm";
    else if (units !== 0) result += DIGITS[units];
  } else if (tens === 0 && units === 0) {
    // Tròn trăm
  }

  return result.trim();
}

/**
 * Đọc số nguyên bất kỳ sang chữ tiếng Việt
 */
export function convertIntegerToVietnamese(num) {
  if (typeof num !== "string") num = String(num);
  num = num.replace(/\D/g, "");
  if (!num) return "";

  num = num.replace(/^0+/, "");
  if (num === "") return "không";

  const unitsScale = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ", "tỷ tỷ"];
  const groups = [];

  while (num.length > 0) {
    const chunk = num.slice(-3);
    groups.unshift(chunk.padStart(3, "0"));
    num = num.slice(0, -3);
  }

  let result = "";
  const totalGroups = groups.length;

  for (let i = 0; i < totalGroups; i++) {
    const groupNum = parseInt(groups[i], 10);
    if (groupNum !== 0) {
      const groupText = readThreeDigits(groups[i], i === 0);
      const scale = unitsScale[totalGroups - 1 - i];
      result += (groupText ? groupText + " " : "") + (scale ? scale + " " : "");
    }
  }

  return result.trim().replace(/\s+/g, " ");
}

/**
 * Đọc số thập phân hoặc số có dấu phẩy/chấm
 */
export function convertDecimalToVietnamese(numStr) {
  if (!numStr) return "";
  const parts = numStr.split(/[.,]/);
  if (parts.length === 2) {
    const intPart = convertIntegerToVietnamese(parts[0]);
    const decDigits = parts[1].split("").map(d => DIGITS[parseInt(d, 10)] || d).join(" ");
    return `${intPart} phẩy ${decDigits}`;
  }
  return convertIntegerToVietnamese(numStr);
}

/**
 * Chuẩn hóa các đại lượng, tiền tệ, thời gian và số liệu trong văn bản
 */
export function normalizeTextForAudio(text) {
  if (!text) return "";

  let cleaned = text;

  // 1. Loại bỏ các định dạng Markdown
  cleaned = cleaned.replace(/^#+\s*(.*)$/gm, "$1.");
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*(.*?)\*/g, "$1");
  cleaned = cleaned.replace(/__(.*?)__/g, "$1");
  cleaned = cleaned.replace(/_(.*?)_/g, "$1");
  cleaned = cleaned.replace(/`{1,3}(.*?)`{1,3}/g, "$1");
  cleaned = cleaned.replace(/\[(.*?)\]\(.*?\)/g, "$1");
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, "");
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, "");

  // 2. Chuẩn hóa giờ giấc
  cleaned = cleaned.replace(/(\d{1,2})h(\d{1,2})p?/gi, (match, h, m) => {
    return `${convertIntegerToVietnamese(h)} giờ ${convertIntegerToVietnamese(m)} phút`;
  });
  cleaned = cleaned.replace(/(\d{1,2}):(\d{2})/g, (match, h, m) => {
    return `${convertIntegerToVietnamese(h)} giờ ${convertIntegerToVietnamese(m)} phút`;
  });
  cleaned = cleaned.replace(/(\d{1,2})h\b/gi, (match, h) => {
    return `${convertIntegerToVietnamese(h)} giờ`;
  });

  // 3. Chuẩn hóa tiền tệ
  cleaned = cleaned.replace(/(\d+[\d.,]*)\s*(?:đ|vnd|vnđ|đồng)/gi, (match, val) => {
    const rawNum = val.replace(/[.,]/g, "");
    return `${convertIntegerToVietnamese(rawNum)} đồng`;
  });
  cleaned = cleaned.replace(/(\d+)\s*k\b/gi, (match, val) => {
    return `${convertIntegerToVietnamese(val)} nghìn`;
  });

  // 4. Chuẩn hóa đơn vị đo lường và phần trăm
  const unitsMap = [
    { regex: /(\d+(?:[.,]\d+)?)\s*km\/h/gi, label: "ki-lô-mét trên giờ" },
    { regex: /(\d+(?:[.,]\d+)?)\s*km/gi, label: "ki-lô-mét" },
    { regex: /(\d+(?:[.,]\d+)?)\s*m2\b/gi, label: "mét vuông" },
    { regex: /(\d+(?:[.,]\d+)?)\s*m3\b/gi, label: "mét khối" },
    { regex: /(\d+(?:[.,]\d+)?)\s*m\b/gi, label: "mét" },
    { regex: /(\d+(?:[.,]\d+)?)\s*cm\b/gi, label: "xen-ti-mét" },
    { regex: /(\d+(?:[.,]\d+)?)\s*mm\b/gi, label: "mi-li-mét" },
    { regex: /(\d+(?:[.,]\d+)?)\s*kg\b/gi, label: "ki-lô-gam" },
    { regex: /(\d+(?:[.,]\d+)?)\s*g\b/gi, label: "gam" },
    { regex: /(\d+(?:[.,]\d+)?)\s*%/gi, label: "phần trăm" },
    { regex: /(\d+(?:[.,]\d+)?)\s*°c/gi, label: "độ xê" }
  ];

  unitsMap.forEach(({ regex, label }) => {
    cleaned = cleaned.replace(regex, (match, val) => {
      if (val.includes(".") || val.includes(",")) {
        return `${convertDecimalToVietnamese(val)} ${label}`;
      }
      return `${convertIntegerToVietnamese(val)} ${label}`;
    });
  });

  // 5. Chuẩn hóa năm & thế kỷ
  cleaned = cleaned.replace(/\bnăm\s+(\d{4})\b/gi, (match, year) => {
    return `năm ${convertIntegerToVietnamese(year)}`;
  });
  cleaned = cleaned.replace(/\bthế kỷ\s+(\d{1,2})\b/gi, (match, century) => {
    return `thế kỷ ${convertIntegerToVietnamese(century)}`;
  });

  // 6. Chuẩn hóa số thập phân độc lập
  cleaned = cleaned.replace(/(\d+)[.,](\d+)/g, (match, intPart, decPart) => {
    if (decPart.length === 3 && intPart.length <= 3) {
      return convertIntegerToVietnamese(intPart + decPart);
    }
    return `${convertIntegerToVietnamese(intPart)} phẩy ${decPart.split("").map(d => DIGITS[parseInt(d, 10)] || d).join(" ")}`;
  });

  // 7. Chuẩn hóa các số nguyên còn lại
  cleaned = cleaned.replace(/\b\d+\b/g, (match) => {
    return convertIntegerToVietnamese(match);
  });

  // 8. Tinh chỉnh dấu câu để audio TTS đọc êm
  cleaned = cleaned.replace(/\.\.\./g, "… ");
  cleaned = cleaned.replace(/--|—/g, ", ");
  cleaned = cleaned.replace(/["“”«»]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/\s+([.,;:?!…])/g, "$1");

  return cleaned.trim();
}
