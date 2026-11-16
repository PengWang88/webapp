/*
 * 角尺 GONLAB — 角度与测量计算核心
 * 纯 JavaScript，无任何依赖。浏览器中挂载为 window.AngleLib，Node 中可直接 require。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AngleLib = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEG_PER_RAD = 180 / Math.PI;
  var RAD_PER_DEG = Math.PI / 180;
  var EPSILON = 1e-10;

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round((value + (value >= 0 ? 1 : -1) * Number.EPSILON) * factor) / factor;
  }

  function normalize360(degrees) {
    if (!isFiniteNumber(degrees)) return NaN;
    var result = degrees % 360;
    if (result < 0) result += 360;
    if (Math.abs(result - 360) < 1e-9) result = 0;
    return result;
  }

  function dmsToDecimal(degrees, minutes, seconds) {
    var d = Number(degrees);
    var m = Number(minutes);
    var s = Number(seconds);
    if (!Number.isFinite(d)) d = 0;
    if (!Number.isFinite(m)) m = 0;
    if (!Number.isFinite(s)) s = 0;
    var sign = (d < 0 || Object.is(d, -0)) ? -1 : 1;
    return sign * (Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600);
  }

  function trimFixed(value, decimals) {
    var text = value.toFixed(decimals);
    if (text.indexOf(".") !== -1) {
      text = text.replace(/0+$/, "").replace(/\.$/, "");
    }
    return text;
  }

  /**
   * 十进制度 → 度分秒结构。
   * secondsDecimals 控制四舍五入到秒的小数位，并正确处理 60″ 进位。
   */
  function decimalToDmsParts(value, options) {
    var opts = options || {};
    var secondsDecimals = opts.secondsDecimals == null ? 1 : opts.secondsDecimals;
    var normalize = Boolean(opts.normalize);
    if (!isFiniteNumber(value)) {
      return { sign: 1, degrees: 0, degreesSigned: 0, minutes: 0, seconds: 0, totalSeconds: NaN };
    }
    if (normalize) value = normalize360(value);

    var sign = value < 0 ? -1 : 1;
    var factor = Math.pow(10, secondsDecimals);
    var totalSeconds = Math.round(Math.abs(value) * 3600 * factor) / factor;

    if (normalize && totalSeconds >= 360 * 3600) totalSeconds = 0;

    var degrees = Math.floor(totalSeconds / 3600 + 1e-9);
    var remainder = totalSeconds - degrees * 3600;
    if (remainder < 0) remainder = 0;

    var minutes = Math.floor(remainder / 60 + 1e-9);
    var seconds = remainder - minutes * 60;
    var secondFactor = Math.pow(10, secondsDecimals);
    seconds = Math.round(seconds * secondFactor) / secondFactor;

    // 秒达到 60 时再进位一次（浮点边界保险）
    if (seconds >= 60 - 1e-9) {
      seconds = 0;
      minutes += 1;
    }
    if (minutes >= 60) {
      minutes = 0;
      degrees += 1;
    }
    if (normalize && degrees >= 360) {
      degrees = 0;
      minutes = 0;
      seconds = 0;
    }

    return {
      sign: sign,
      degrees: degrees,
      degreesSigned: sign * degrees,
      minutes: minutes,
      seconds: seconds,
      totalSeconds: sign * (degrees * 3600 + minutes * 60 + seconds)
    };
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  /**
   * 格式化为 45°30′00.0″。默认保留 1 位秒小数。
   */
  function formatDms(value, options) {
    var opts = options || {};
    var secondsDecimals = opts.secondsDecimals == null ? 1 : opts.secondsDecimals;
    var normalize = Boolean(opts.normalize);
    var padMinutes = opts.padMinutes !== false;
    var includeSign = opts.sign !== false;

    if (!isFiniteNumber(value)) return "—";

    var parts = decimalToDmsParts(value, {
      secondsDecimals: secondsDecimals,
      normalize: normalize
    });

    var signText = parts.sign < 0 && includeSign ? "-" : "";
    if (Math.abs(value) < 1e-9) signText = "";

    var minuteText = padMinutes ? pad2(parts.minutes) : String(parts.minutes);
    var secondNumber = parts.seconds.toFixed(secondsDecimals);
    if (secondsDecimals === 0) {
      secondNumber = pad2(Number(secondNumber));
    } else if (parts.seconds < 10) {
      secondNumber = "0" + secondNumber;
    }

    return signText + parts.degrees + "°" + minuteText + "′" + secondNumber + "″";
  }

  function formatDecimal(value, decimals) {
    if (!isFiniteNumber(value)) return "—";
    return value.toFixed(decimals == null ? 6 : decimals);
  }

  function formatSignedSeconds(seconds, decimals) {
    if (!isFiniteNumber(seconds)) return "—";
    var digits = decimals == null ? 1 : decimals;
    var rounded = round(seconds, digits);
    if (Math.abs(rounded) < Math.pow(10, -digits) / 2) return (0).toFixed(digits) + "″";
    return (rounded > 0 ? "+" : "-") + Math.abs(rounded).toFixed(digits) + "″";
  }

  /**
   * 尽量宽容地解析粘贴的角值：
   * 45°30′15″ / 45 30 15 / 45:30:15 / 45.504167 / -45°30′
   */
  function parseDmsString(input) {
    if (input == null) return NaN;
    var text = String(input).trim();
    if (!text) return NaN;
    text = text.replace(/[−–—]/g, "-").replace(/[,\s]+/g, " ").trim();

    if (/^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }

    var negative = /^-/.test(text);
    var cleaned = text.replace(/^-/, "").replace(/[°º˚]/g, " ").replace(/[′'’]/g, " ").replace(/[″"”]/g, " ").replace(/:/g, " ").replace(/\s+/g, " ").trim();
    var bits = cleaned.split(" ").filter(Boolean).map(Number);
    if (!bits.length || bits.some(function (n) { return !Number.isFinite(n); })) return NaN;
    if (bits.length > 3) return NaN;
    var value = dmsToDecimal(bits[0], bits[1] || 0, bits[2] || 0);
    return negative ? -value : value;
  }

  function quadrantFor(dx, dy) {
    var tolerance = 1e-9;
    var northSouth = Math.abs(dx) <= tolerance ? "" : dx > 0 ? "北" : "南";
    var eastWest = Math.abs(dy) <= tolerance ? "" : dy > 0 ? "东" : "西";
    var code = (northSouth || "O") + (eastWest || "O");
    if (!northSouth && !eastWest) return { code: "O", name: "重合", bearing: "—" };
    if (!northSouth) return { code: eastWest === "东" ? "E" : "W", name: "正" + eastWest, bearing: eastWest === "东" ? "E" : "W" };
    if (!eastWest) return { code: northSouth === "北" ? "N" : "S", name: "正" + northSouth, bearing: northSouth === "北" ? "N" : "S" };
    return {
      code: northSouth + eastWest,
      name: northSouth + eastWest,
      bearing: northSouth + "·" + eastWest
    };
  }

  /**
   * 测量坐标系：X 为北向，Y 为东向；方位角自北方向顺时针量取。
   */
  function azimuthFromDelta(dxNorth, dyEast) {
    var dx = Number(dxNorth) || 0;
    var dy = Number(dyEast) || 0;
    var distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance < 1e-9) {
      return {
        valid: false,
        reason: "两点重合，方位角无定义",
        dx: dx,
        dy: dy,
        distance: 0,
        azimuth: NaN,
        backAzimuth: NaN,
        quadrant: quadrantFor(0, 0),
        quadrantAngle: NaN
      };
    }

    var azimuth = normalize360(Math.atan2(dy, dx) * DEG_PER_RAD);
    var quadrantAngle = Math.atan2(Math.abs(dy), Math.abs(dx)) * DEG_PER_RAD;
    var quadrant = quadrantFor(dx, dy);

    return {
      valid: true,
      dx: dx,
      dy: dy,
      distance: distance,
      azimuth: azimuth,
      backAzimuth: normalize360(azimuth + 180),
      quadrant: quadrant,
      quadrantAngle: quadrantAngle
    };
  }

  function azimuthFromPoints(x1, y1, x2, y2) {
    return azimuthFromDelta(Number(x2) - Number(x1), Number(y2) - Number(y1));
  }

  /**
   * 夹角：right 为从 A 顺时针转到 B 的角（测量右角），left 为反向。
   */
  function includedAngles(azimuthA, azimuthB) {
    var a = normalize360(Number(azimuthA));
    var b = normalize360(Number(azimuthB));
    var right = normalize360(b - a);
    var left = normalize360(a - b);
    return {
      azimuthA: a,
      azimuthB: b,
      right: right,
      left: left,
      smaller: Math.min(right, left),
      larger: Math.max(right, left)
    };
  }

  /**
   * 闭合多边形内角和角度闭合差。
   * angles: 十进制度数组；coefficient: 容许闭合差系数（秒），默认图根 40″√n。
   */
  function traverseClosure(angles, coefficient) {
    var values = angles.map(Number);
    if (!values.length || values.some(function (n) { return !Number.isFinite(n); })) {
      return { valid: false, reason: "请输入全部角度" };
    }
    var n = values.length;
    if (n < 3) return { valid: false, reason: "多边形至少需要 3 个内角" };

    var coef = coefficient == null ? 40 : Number(coefficient);
    var measuredSum = values.reduce(function (sum, value) { return sum + value; }, 0);
    var theoreticalSum = (n - 2) * 180;
    var closure = measuredSum - theoreticalSum;
    var closureSeconds = closure * 3600;
    var toleranceSeconds = coef * Math.sqrt(n);
    var correctionSeconds = -closureSeconds / n;
    var correction = -closure / n;
    var corrected = values.map(function (value) { return value + correction; });
    var correctedSum = corrected.reduce(function (sum, value) { return sum + value; }, 0);

    return {
      valid: true,
      n: n,
      angles: values,
      coefficient: coef,
      measuredSum: measuredSum,
      theoreticalSum: theoreticalSum,
      closure: closure,
      closureSeconds: closureSeconds,
      toleranceSeconds: toleranceSeconds,
      correction: correction,
      correctionSeconds: correctionSeconds,
      corrected: corrected,
      correctedSum: correctedSum,
      passed: Math.abs(closureSeconds) <= toleranceSeconds + 1e-9
    };
  }

  return {
    DEG_PER_RAD: DEG_PER_RAD,
    RAD_PER_DEG: RAD_PER_DEG,
    round: round,
    normalize360: normalize360,
    dmsToDecimal: dmsToDecimal,
    decimalToDmsParts: decimalToDmsParts,
    formatDms: formatDms,
    formatDecimal: formatDecimal,
    formatSignedSeconds: formatSignedSeconds,
    parseDmsString: parseDmsString,
    azimuthFromDelta: azimuthFromDelta,
    azimuthFromPoints: azimuthFromPoints,
    includedAngles: includedAngles,
    traverseClosure: traverseClosure,
    trimFixed: trimFixed
  };
});
