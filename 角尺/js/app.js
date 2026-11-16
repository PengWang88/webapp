/*
 * 角尺 GONLAB — native application logic
 * 无框架、无构建步骤。全部运算在浏览器本地完成。
 */
(function () {
  "use strict";

  var A = window.AngleLib;
  if (!A) {
    document.body.innerHTML = '<main style="padding:40px;font-family:sans-serif"><h1>计算核心未加载</h1><p>请确认 js/angle.js 与本页面在同一目录结构中。</p></main>';
    return;
  }

  var $ = function (selector, context) {
    return (context || document).querySelector(selector);
  };
  var $$ = function (selector, context) {
    return Array.prototype.slice.call((context || document).querySelectorAll(selector));
  };

  var TOOL_META = {
    convert: { name: "角度转换", title: "角度转换", color: "#ffd23f" },
    ops: { name: "角度运算", title: "角度运算", color: "#79e4dc" },
    azimuth: { name: "坐标方位角", title: "坐标方位角", color: "#ffa2bd" },
    included: { name: "夹角计算", title: "夹角计算", color: "#b9ee72" },
    traverse: { name: "导线闭合差", title: "导线闭合差", color: "#ffb15f" }
  };

  var saveBuilders = {};
  var toastTimer = null;

  /* ------------------------------------------------------------------------
     Small utilities
     ------------------------------------------------------------------------ */

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseNumber(text) {
    if (text == null) return NaN;
    var raw = String(text).trim().replace(/,/g, "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
    if (!raw) return NaN;
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return NaN;
    var value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function readDms(ids) {
    var raw = ids.map(function (id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : "";
    });
    if (raw.every(function (v) { return v === ""; })) return NaN;
    var nums = raw.map(function (value) {
      return value === "" ? 0 : parseNumber(value);
    });
    if (nums.some(function (value) { return !Number.isFinite(value); })) return NaN;
    return A.dmsToDecimal(nums[0], nums[1], nums[2]);
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function fmtDms(value, options) {
    return A.formatDms(value, options || { secondsDecimals: 1 });
  }

  function fmtDecimal(value, digits) {
    if (!Number.isFinite(value)) return "—";
    return value.toFixed(digits == null ? 6 : digits);
  }

  function fmtSigned(value, digits) {
    if (!Number.isFinite(value)) return "—";
    var places = digits == null ? 3 : digits;
    var rounded = A.round(value, places);
    if (Math.abs(rounded) < Math.pow(10, -places) / 2) return (0).toFixed(places);
    return (rounded > 0 ? "+" : "-") + Math.abs(rounded).toFixed(places);
  }

  function fmtSignedDms(value) {
    if (!Number.isFinite(value)) return "—";
    var absText = fmtDms(Math.abs(value));
    if (Math.abs(value) < 0.0000001) return absText;
    return (value > 0 ? "+" : "-") + absText;
  }

  function setDmsFields(ids, value, secondDecimals) {
    var sign = value < 0 ? "-" : "";
    var parts = A.decimalToDmsParts(value, { secondsDecimals: secondDecimals == null ? 3 : secondDecimals });
    var degreeEl = document.getElementById(ids[0]);
    var minuteEl = document.getElementById(ids[1]);
    var secondEl = document.getElementById(ids[2]);
    if (degreeEl) degreeEl.value = sign + String(parts.degrees);
    if (minuteEl) minuteEl.value = String(parts.minutes);
    if (secondEl) secondEl.value = A.trimFixed(parts.seconds, secondDecimals == null ? 3 : secondDecimals);
  }

  function showToast(message) {
    var toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-on");
    }, 2100);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(area);
    return copied;
  }

  function flashCopiedButton(button) {
    if (!button) return;
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent;
    }
    button.textContent = "已复制";
    button.classList.add("is-copied");
    window.clearTimeout(button._copyTimer);
    button._copyTimer = window.setTimeout(function () {
      button.textContent = button.dataset.originalLabel;
      button.classList.remove("is-copied");
    }, 1200);
  }

  function copyText(text, button) {
    var clean = String(text == null ? "" : text).trim();
    if (!clean || clean === "—") {
      showToast("暂无可复制的结果");
      return;
    }
    function done() {
      flashCopiedButton(button);
      showToast("已复制到剪贴板");
    }
    function fail() {
      if (fallbackCopy(clean)) {
        done();
      } else {
        showToast("复制失败，请手动选择文本");
      }
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(clean).then(done).catch(fail);
    } else {
      fail();
    }
  }

  /* ------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------ */

  function readViewFromHash() {
    var id = (window.location.hash || "").replace(/^#\/?/, "");
    return TOOL_META[id] ? id : "convert";
  }

  function setView(id, options) {
    var opts = options || {};
    if (!TOOL_META[id]) id = "convert";
    $$(".view").forEach(function (view) {
      view.hidden = view.dataset.view !== id;
    });

    $$(".nav-item").forEach(function (link) {
      var active = link.dataset.nav === id;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    document.title = TOOL_META[id].title + " · 角尺 GONLAB";

    if (opts.replaceHash && window.location.hash !== "#" + id) {
      try {
        window.history.replaceState(null, "", "#" + id);
      } catch (error) {
        /* file:// in some browsers may reject replaceState; navigation still works. */
      }
    }

    if (opts.scroll) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function initNavigation() {
    setView(readViewFromHash(), { replaceHash: true, scroll: false });
    window.addEventListener("hashchange", function () {
      setView(readViewFromHash(), { scroll: true });
    });
  }

  /* ------------------------------------------------------------------------
     01 · Converter
     ------------------------------------------------------------------------ */

  var convState = { value: NaN };

  function initConverter() {
    var degEl = $("#conv-deg");
    var minEl = $("#conv-min");
    var secEl = $("#conv-sec");
    var decEl = $("#conv-dec");

    function clearResult() {
      convState.value = NaN;
      setText("conv-dms-out", "—");
      setText("conv-caption", "输入有效角度后实时换算");
      setText("conv-dec-out", "—");
      setText("conv-rad-out", "—");
      setText("conv-gon-out", "—");
      setText("conv-breakdown", "—");
    }

    function render(value) {
      if (!Number.isFinite(value)) {
        clearResult();
        return;
      }
      convState.value = value;
      var parts = A.decimalToDmsParts(value, { secondsDecimals: 1 });
      var direction = value < 0 ? "负角 / 逆时针" : "正角 / 顺时针";
      var secs = Math.abs(parts.seconds).toFixed(1);
      var signWord = value < 0 ? "-" : "";

      setText("conv-dms-out", A.formatDms(value, { secondsDecimals: 1 }));
      setText(
        "conv-caption",
        parts.degrees + " 度 " + parts.minutes + " 分 " + secs + " 秒 · " + direction
      );
      setText("conv-dec-out", fmtDecimal(value, 6) + "°");
      setText("conv-rad-out", (value * A.RAD_PER_DEG).toFixed(6) + " rad");
      setText("conv-gon-out", (value / 0.9).toFixed(6) + " gon");
      setText(
        "conv-breakdown",
        "DEC = " + signWord + "(" + parts.degrees + " + " + parts.minutes + "/60 + " + secs + "/3600) = " + fmtDecimal(value, 6) + "°"
      );
    }

    function readConverterDms() {
      return readDms(["conv-deg", "conv-min", "conv-sec"]);
    }

    function fromDms() {
      var allEmpty = [degEl.value, minEl.value, secEl.value].every(function (v) { return v.trim() === ""; });
      if (allEmpty) {
        decEl.value = "";
        clearResult();
        return;
      }
      var value = readConverterDms();
      if (!Number.isFinite(value)) {
        clearResult();
        return;
      }
      decEl.value = A.trimFixed(A.round(value, 10), 10);
      render(value);
    }

    function fromDecimal() {
      var raw = decEl.value.trim();
      if (!raw) {
        clearResult();
        return;
      }
      var value = A.parseDmsString(raw);
      if (!Number.isFinite(value)) {
        clearResult();
        return;
      }
      setDmsFields(["conv-deg", "conv-min", "conv-sec"], value, 3);
      render(value);
    }

    [degEl, minEl, secEl].forEach(function (el) {
      el.addEventListener("input", fromDms);
    });
    decEl.addEventListener("input", fromDecimal);

    $("#conv-reset").addEventListener("click", function () {
      [degEl, minEl, secEl, decEl].forEach(function (el) { el.value = ""; });
      clearResult();
      decEl.focus();
    });

    $$("[data-conv-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var value = Number(button.dataset.convPreset);
        decEl.value = String(value);
        setDmsFields(["conv-deg", "conv-min", "conv-sec"], value, 3);
        render(value);
      });
    });

    saveBuilders.convert = function () {
      if (!Number.isFinite(convState.value)) return null;
      var value = convState.value;
      return {
        value: A.formatDms(value, { secondsDecimals: 1 }),
        meta: fmtDecimal(value, 6) + "° · " + (value / 0.9).toFixed(4) + " gon"
      };
    };

    fromDms();
  }

  /* ------------------------------------------------------------------------
     02 · Angle arithmetic
     ------------------------------------------------------------------------ */

  var opState = { op: "add", shown: NaN, raw: NaN, a: NaN, b: NaN };

  function initOperations() {
    var idsA = ["op-a-deg", "op-a-min", "op-a-sec"];
    var idsB = ["op-b-deg", "op-b-min", "op-b-sec"];
    var normalizeEl = $("#op-normalize");

    function setInvalid() {
      opState.shown = NaN;
      opState.raw = NaN;
      opState.a = NaN;
      opState.b = NaN;
      setText("op-result-dms", "—");
      setText("op-result-caption", "请输入角 A 与角 B");
      setText("op-raw-out", "—");
      setText("op-normalized-out", "—");
      setText("op-equation", "—");
    }

    function render() {
      var a = readDms(idsA);
      var b = readDms(idsB);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        setInvalid();
        return;
      }

      var raw = opState.op === "add" ? a + b : a - b;
      var normalized = A.normalize360(raw);
      var useNormalized = normalizeEl.checked;
      var shown = useNormalized ? normalized : raw;
      var symbol = opState.op === "add" ? "＋" : "−";

      opState.a = a;
      opState.b = b;
      opState.raw = raw;
      opState.shown = shown;

      setText("op-result-type", "A " + symbol + " B");
      setText("op-result-dms", fmtDms(shown));
      setText(
        "op-result-caption",
        "十进制度 " + fmtDecimal(shown, 6) + "° · " + (useNormalized ? "已归一化" : "原始值")
      );
      setText("op-raw-out", fmtDms(raw));
      setText("op-normalized-out", fmtDms(normalized));
      setText("op-equation", fmtDms(a) + " " + symbol + " " + fmtDms(b) + " = " + fmtDms(raw));
    }

    [idsA, idsB].forEach(function (group) {
      group.forEach(function (id) {
        document.getElementById(id).addEventListener("input", render);
      });
    });

    $$("[data-op]").forEach(function (button) {
      button.addEventListener("click", function () {
        opState.op = button.dataset.op;
        $$("[data-op]").forEach(function (item) {
          var active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
        });
        render();
      });
    });

    normalizeEl.addEventListener("change", render);

    $("#op-swap").addEventListener("click", function () {
      idsA.forEach(function (id, index) {
        var aEl = document.getElementById(id);
        var bEl = document.getElementById(idsB[index]);
        var temp = aEl.value;
        aEl.value = bEl.value;
        bEl.value = temp;
      });
      render();
    });

    $("#op-reset").addEventListener("click", function () {
      idsA.concat(idsB).forEach(function (id) {
        document.getElementById(id).value = "";
      });
      normalizeEl.checked = true;
      opState.op = "add";
      $$("[data-op]").forEach(function (item) {
        var active = item.dataset.op === "add";
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      setInvalid();
      document.getElementById(idsA[0]).focus();
    });

    saveBuilders.ops = function () {
      if (!Number.isFinite(opState.shown)) return null;
      return {
        value: fmtDms(opState.shown),
        meta: "原始 " + fmtDms(opState.raw) + " · " + fmtDecimal(opState.shown, 6) + "°"
      };
    };

    render();
  }

  /* ------------------------------------------------------------------------
     03 · Azimuth
     ------------------------------------------------------------------------ */

  var azState = { mode: "points", result: null };

  function polarPoint(azimuth, radius) {
    var radians = azimuth * A.RAD_PER_DEG;
    return {
      x: 120 + Math.sin(radians) * radius,
      y: 120 - Math.cos(radians) * radius
    };
  }

  function arcPath(startAzimuth, endAzimuth, radius) {
    var delta = A.normalize360(endAzimuth - startAzimuth);
    if (delta < 0.02 || delta > 359.98) return "";
    var start = polarPoint(startAzimuth, radius);
    var end = polarPoint(endAzimuth, radius);
    var largeArc = delta > 180 ? 1 : 0;
    return "M " + start.x.toFixed(2) + " " + start.y.toFixed(2) +
      " A " + radius + " " + radius + " 0 " + largeArc + " 1 " +
      end.x.toFixed(2) + " " + end.y.toFixed(2);
  }

  function setSvgVisible(id, visible) {
    var el = document.getElementById(id);
    if (el) el.setAttribute("visibility", visible ? "visible" : "hidden");
  }

  function quadrantCode(name) {
    var codes = {
      "北东": "NE", "南东": "SE", "南西": "SW", "北西": "NW",
      "正北": "N", "正东": "E", "正南": "S", "正西": "W"
    };
    return codes[name] || "—";
  }

  function initAzimuth() {
    var ids = ["az-x1", "az-y1", "az-x2", "az-y2", "az-dx", "az-dy"];

    function setMode(mode) {
      azState.mode = mode;
      $$("[data-az-mode]").forEach(function (button) {
        var active = button.dataset.azMode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      $("#az-panel-points").hidden = mode !== "points";
      $("#az-panel-delta").hidden = mode !== "delta";
      renderAzimuth();
    }

    function readInput() {
      if (azState.mode === "points") {
        var x1 = parseNumber($("#az-x1").value);
        var y1 = parseNumber($("#az-y1").value);
        var x2 = parseNumber($("#az-x2").value);
        var y2 = parseNumber($("#az-y2").value);
        if ([x1, y1, x2, y2].some(function (value) { return !Number.isFinite(value); })) {
          return { valid: false, reason: "请输入完整的 P1 / P2 坐标" };
        }
        return A.azimuthFromPoints(x1, y1, x2, y2);
      }
      var dx = parseNumber($("#az-dx").value);
      var dy = parseNumber($("#az-dy").value);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return { valid: false, reason: "请输入完整的 ΔX / ΔY 增量" };
      }
      return A.azimuthFromDelta(dx, dy);
    }

    function renderEmpty(reason) {
      azState.result = null;
      setText("az-dms", "—");
      setText("az-dec", reason || "输入坐标后自动反算");
      setText("az-quad", "—");
      setText("az-dist", "—");
      setText("az-back", "—");
      setText("az-dxdy", "—");
      setText("az-bearing", "—");
      setText("az-formula", "输入完整坐标后自动反算方位角与距离");
      setSvgVisible("az-vector", false);
      setSvgVisible("az-arc", false);
      setSvgVisible("az-arc-label", false);
    }

    function renderAzimuth() {
      var result = readInput();
      if (!result.valid) {
        renderEmpty(result.reason);
        return;
      }
      azState.result = result;

      var az = result.azimuth;
      var q = result.quadrant;
      var end = polarPoint(az, 80);
      var mid = polarPoint(az / 2, 63);
      var arc = arcPath(0, az, 56);

      setText("az-dms", A.formatDms(az, { secondsDecimals: 1, normalize: true }));
      setText("az-dec", "十进制度 " + fmtDecimal(az, 6) + "°");
      setText("az-quad", q.name + " · " + quadrantCode(q.name));
      setText("az-dist", fmtDecimal(result.distance, 3) + " m");
      setText("az-back", A.formatDms(result.backAzimuth, { secondsDecimals: 1, normalize: true }));
      setText("az-dxdy", "ΔX " + fmtSigned(result.dx, 3) + " / ΔY " + fmtSigned(result.dy, 3));
      setText("az-bearing", q.name + " " + fmtDms(result.quadrantAngle));
      setText(
        "az-formula",
        "α = atan2(ΔY, ΔX) = atan2(" + fmtSigned(result.dy, 3) + ", " + fmtSigned(result.dx, 3) + ") = " + fmtDecimal(az, 6) + "°"
      );

      var vector = $("#az-vector");
      if (vector) {
        vector.setAttribute("x2", end.x.toFixed(2));
        vector.setAttribute("y2", end.y.toFixed(2));
      }
      setSvgVisible("az-vector", true);

      var arcEl = $("#az-arc");
      if (arcEl) arcEl.setAttribute("d", arc);
      setSvgVisible("az-arc", Boolean(arc));

      var label = $("#az-arc-label");
      if (label) {
        label.setAttribute("x", mid.x.toFixed(2));
        label.setAttribute("y", (mid.y + 4).toFixed(2));
        label.textContent = Math.round(az) + "°";
      }
      setSvgVisible("az-arc-label", az > 2 && az < 358);

      var compass = $("#az-compass");
      if (compass) {
        compass.setAttribute("aria-label", "方位角示意图，方位角 " + az.toFixed(1) + " 度，方向" + q.name);
      }
    }

    ids.forEach(function (id) {
      document.getElementById(id).addEventListener("input", renderAzimuth);
    });

    $$("[data-az-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.dataset.azMode);
      });
    });

    $$("[data-az-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var presets = {
          ne: [30, 40],
          se: [-30, 40],
          sw: [-30, -40],
          nw: [30, -40]
        };
        var pair = presets[button.dataset.azPreset];
        setMode("delta");
        $("#az-dx").value = String(pair[0]);
        $("#az-dy").value = String(pair[1]);
        renderAzimuth();
      });
    });

    $("#az-swap").addEventListener("click", function () {
      if (azState.mode === "points") {
        var x1 = $("#az-x1").value;
        var y1 = $("#az-y1").value;
        $("#az-x1").value = $("#az-x2").value;
        $("#az-y1").value = $("#az-y2").value;
        $("#az-x2").value = x1;
        $("#az-y2").value = y1;
      } else {
        var dx = parseNumber($("#az-dx").value);
        var dy = parseNumber($("#az-dy").value);
        if (Number.isFinite(dx) && Number.isFinite(dy)) {
          $("#az-dx").value = fmtSigned(-dx, 3).replace(/^\+/, "");
          $("#az-dy").value = fmtSigned(-dy, 3).replace(/^\+/, "");
        }
      }
      renderAzimuth();
    });

    $("#az-reset").addEventListener("click", function () {
      ids.forEach(function (id) { document.getElementById(id).value = ""; });
      renderEmpty("输入坐标后自动反算");
      document.getElementById(azState.mode === "points" ? "az-x1" : "az-dx").focus();
    });

    saveBuilders.azimuth = function () {
      var result = azState.result;
      if (!result || !result.valid) return null;
      return {
        value: A.formatDms(result.azimuth, { secondsDecimals: 1, normalize: true }),
        meta: "D " + fmtDecimal(result.distance, 3) + " m · 反方位 " + A.formatDms(result.backAzimuth, { secondsDecimals: 1, normalize: true }) + " · " + result.quadrant.name
      };
    };

    renderAzimuth();
  }

  /* ------------------------------------------------------------------------
     04 · Included angle
     ------------------------------------------------------------------------ */

  var incState = { mode: "azimuth", result: null };

  function setLineEnd(id, point) {
    var line = document.getElementById(id);
    if (!line) return;
    line.setAttribute("x2", point.x.toFixed(2));
    line.setAttribute("y2", point.y.toFixed(2));
  }

  function setTextPosition(id, point) {
    var text = document.getElementById(id);
    if (!text) return;
    text.setAttribute("x", point.x.toFixed(2));
    text.setAttribute("y", (point.y + 4).toFixed(2));
  }

  function initIncluded() {
    var azimuthIdsA = ["inc-a-deg", "inc-a-min", "inc-a-sec"];
    var azimuthIdsB = ["inc-b-deg", "inc-b-min", "inc-b-sec"];
    var pointIds = ["inc-ax", "inc-ay", "inc-ox", "inc-oy", "inc-bx", "inc-by"];

    function setMode(mode) {
      incState.mode = mode;
      $$("[data-inc-mode]").forEach(function (button) {
        var active = button.dataset.incMode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      $("#inc-panel-azimuth").hidden = mode !== "azimuth";
      $("#inc-panel-points").hidden = mode !== "points";
      renderIncluded();
    }

    function readDirections() {
      if (incState.mode === "azimuth") {
        var azA = readDms(azimuthIdsA);
        var azB = readDms(azimuthIdsB);
        if (!Number.isFinite(azA) || !Number.isFinite(azB)) {
          return { valid: false, reason: "请输入方向 A 与方向 B 的方位角" };
        }
        return {
          valid: true,
          azA: A.normalize360(azA),
          azB: A.normalize360(azB),
          distanceA: null,
          distanceB: null,
          pointsMode: false
        };
      }

      var ax = parseNumber($("#inc-ax").value);
      var ay = parseNumber($("#inc-ay").value);
      var ox = parseNumber($("#inc-ox").value);
      var oy = parseNumber($("#inc-oy").value);
      var bx = parseNumber($("#inc-bx").value);
      var by = parseNumber($("#inc-by").value);
      if ([ax, ay, ox, oy, bx, by].some(function (value) { return !Number.isFinite(value); })) {
        return { valid: false, reason: "请输入 A、O、B 三点的完整坐标" };
      }
      var oa = A.azimuthFromPoints(ox, oy, ax, ay);
      var ob = A.azimuthFromPoints(ox, oy, bx, by);
      if (!oa.valid || !ob.valid) {
        return { valid: false, reason: "测站点与 A 或 B 重合，无法定义方向" };
      }
      return {
        valid: true,
        azA: oa.azimuth,
        azB: ob.azimuth,
        distanceA: oa.distance,
        distanceB: ob.distance,
        pointsMode: true
      };
    }

    function hideRays() {
      ["inc-wedge", "inc-arc", "inc-ray-a", "inc-ray-b", "inc-label-a", "inc-label-b", "inc-arc-label"].forEach(function (id) {
        setSvgVisible(id, false);
      });
    }

    function renderEmpty(reason) {
      incState.result = null;
      setText("inc-right-out", "—");
      setText("inc-caption", reason || "输入方向后自动计算");
      setText("inc-left-out", "—");
      setText("inc-small-out", "—");
      setText("inc-larger-out", "—");
      setText("inc-directions", "—");
      setText("inc-formula", "输入方向后自动计算左右夹角");
      setText("inc-extra", "—");
      hideRays();
    }

    function renderIncluded() {
      var directions = readDirections();
      if (!directions.valid) {
        renderEmpty(directions.reason);
        return;
      }

      var inc = A.includedAngles(directions.azA, directions.azB);
      incState.result = {
        directions: directions,
        inc: inc
      };

      setText("inc-right-out", fmtDms(inc.right));
      setText("inc-caption", "右角 / CLOCKWISE");
      setText("inc-left-out", fmtDms(inc.left));
      setText("inc-small-out", fmtDms(inc.smaller));
      setText("inc-larger-out", fmtDms(inc.larger));
      setText("inc-directions", "A " + fmtDms(directions.azA) + " → B " + fmtDms(directions.azB));

      if (directions.pointsMode) {
        setText(
          "inc-formula",
          "αOA = " + fmtDms(directions.azA) + "；αOB = " + fmtDms(directions.azB) +
          "；右角 = (" + fmtDms(directions.azB) + " − " + fmtDms(directions.azA) + " + 360°) mod 360° = " + fmtDms(inc.right)
        );
        setText(
          "inc-extra",
          "OA " + fmtDecimal(directions.distanceA, 3) + " m · OB " + fmtDecimal(directions.distanceB, 3) + " m"
        );
      } else {
        setText(
          "inc-formula",
          "右角 = (αB − αA + 360°) mod 360° = (" + fmtDms(directions.azB) + " − " + fmtDms(directions.azA) + " + 360°) mod 360° = " + fmtDms(inc.right)
        );
        setText("inc-extra", "测量右角：从后视方向顺时针转到前视方向");
      }

      var pointA = polarPoint(directions.azA, 80);
      var pointB = polarPoint(directions.azB, 80);
      var labelA = polarPoint(directions.azA, 94);
      var labelB = polarPoint(directions.azB, 94);
      var wedgeA = polarPoint(directions.azA, 72);
      var wedgeB = polarPoint(directions.azB, 72);
      var arc = arcPath(directions.azA, directions.azB, 54);
      var arcLabelPoint = polarPoint(directions.azA + inc.right / 2, 64);

      setLineEnd("inc-ray-a", pointA);
      setLineEnd("inc-ray-b", pointB);
      setTextPosition("inc-label-a", labelA);
      setTextPosition("inc-label-b", labelB);
      setText("inc-label-a", "A");
      setText("inc-label-b", "B");
      setSvgVisible("inc-ray-a", true);
      setSvgVisible("inc-ray-b", true);
      setSvgVisible("inc-label-a", true);
      setSvgVisible("inc-label-b", true);

      var wedge = $("#inc-wedge");
      if (wedge) {
        if (inc.right > 0.02 && inc.right < 359.98) {
          wedge.setAttribute(
            "d",
            "M 120 120 L " + wedgeA.x.toFixed(2) + " " + wedgeA.y.toFixed(2) +
            " A 72 72 0 " + (inc.right > 180 ? 1 : 0) + " 1 " + wedgeB.x.toFixed(2) + " " + wedgeB.y.toFixed(2) + " Z"
          );
        } else {
          wedge.setAttribute("d", "");
        }
      }
      setSvgVisible("inc-wedge", inc.right > 0.02 && inc.right < 359.98);

      var arcEl = $("#inc-arc");
      if (arcEl) arcEl.setAttribute("d", arc);
      setSvgVisible("inc-arc", Boolean(arc));

      var arcLabel = $("#inc-arc-label");
      if (arcLabel) {
        arcLabel.setAttribute("x", arcLabelPoint.x.toFixed(2));
        arcLabel.setAttribute("y", (arcLabelPoint.y + 4).toFixed(2));
        arcLabel.textContent = A.round(inc.right, 1) + "°";
      }
      setSvgVisible("inc-arc-label", inc.right > 2 && inc.right < 358);

      var compass = $("#inc-compass");
      if (compass) {
        compass.setAttribute(
          "aria-label",
          "夹角示意图，A 方向方位角 " + directions.azA.toFixed(1) + " 度，B 方向方位角 " +
          directions.azB.toFixed(1) + " 度，顺时针夹角 " + inc.right.toFixed(1) + " 度"
        );
      }
    }

    azimuthIdsA.concat(azimuthIdsB).forEach(function (id) {
      document.getElementById(id).addEventListener("input", renderIncluded);
    });
    pointIds.forEach(function (id) {
      document.getElementById(id).addEventListener("input", renderIncluded);
    });

    $$("[data-inc-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.dataset.incMode);
      });
    });

    $("#inc-swap").addEventListener("click", function () {
      if (incState.mode === "azimuth") {
        azimuthIdsA.forEach(function (id, index) {
          var aEl = document.getElementById(id);
          var bEl = document.getElementById(azimuthIdsB[index]);
          var temp = aEl.value;
          aEl.value = bEl.value;
          bEl.value = temp;
        });
      } else {
        ["ax", "ay"].forEach(function (part) {
          var aEl = document.getElementById("inc-" + part);
          var bEl = document.getElementById("inc-b" + part.charAt(1));
          var temp = aEl.value;
          aEl.value = bEl.value;
          bEl.value = temp;
        });
      }
      renderIncluded();
    });

    $("#inc-reset").addEventListener("click", function () {
      azimuthIdsA.concat(azimuthIdsB, pointIds).forEach(function (id) {
        document.getElementById(id).value = "";
      });
      renderEmpty("输入方向后自动计算");
      document.getElementById(incState.mode === "azimuth" ? "inc-a-deg" : "inc-ax").focus();
    });

    saveBuilders.included = function () {
      if (!incState.result) return null;
      var inc = incState.result.inc;
      var directions = incState.result.directions;
      var meta = "左角 " + fmtDms(inc.left) + " · 较小 " + fmtDms(inc.smaller);
      if (directions.pointsMode) {
        meta += " · OA " + fmtDecimal(directions.distanceA, 3) + " m";
      }
      return { value: "右角 " + fmtDms(inc.right), meta: meta };
    };

    renderIncluded();
  }

  /* ------------------------------------------------------------------------
     05 · Traverse closure
     ------------------------------------------------------------------------ */

  var TRAVERSE_SAMPLE = [
    { d: "108", m: "00", s: "12" },
    { d: "112", m: "00", s: "18" },
    { d: "95", m: "00", s: "05" },
    { d: "120", m: "00", s: "20" },
    { d: "105", m: "00", s: "08" }
  ];

  var travState = {
    n: 5,
    angles: TRAVERSE_SAMPLE.map(function (row) { return { d: row.d, m: row.m, s: row.s }; }),
    result: null,
    copyText: ""
  };

  function initTraverse() {
    var list = $("#trav-angles");
    var countOut = $("#trav-count");
    var minus = $("#trav-minus");
    var plus = $("#trav-plus");
    var grade = $("#trav-grade");
    var customWrap = $("#trav-custom-wrap");
    var custom = $("#trav-custom");

    function blankRow() {
      return { d: "", m: "", s: "" };
    }

    function rowValue(row) {
      var d = row.d.trim() === "" ? 0 : parseNumber(row.d);
      var m = row.m.trim() === "" ? 0 : parseNumber(row.m);
      var s = row.s.trim() === "" ? 0 : parseNumber(row.s);
      if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return NaN;
      return A.dmsToDecimal(d, m, s);
    }

    function coefficient() {
      if (grade.value === "custom") {
        var value = parseNumber(custom.value);
        return Number.isFinite(value) && value > 0 ? value : NaN;
      }
      var preset = Number(grade.value);
      return Number.isFinite(preset) ? preset : NaN;
    }

    function renderRows() {
      var html = travState.angles.map(function (row, index) {
        return '' +
          '<div class="trav-row">' +
            '<span class="trav-index">' + pad2(index + 1) + '</span>' +
            '<div class="dms-input" role="group" aria-label="第 ' + (index + 1) + ' 个内角">' +
              '<label class="dms-cell">' +
                '<input type="text" inputmode="decimal" autocomplete="off" data-row="' + index + '" data-part="d" value="' + escapeHtml(row.d) + '" aria-label="第 ' + (index + 1) + ' 个角的度">' +
                '<span>度 <b>°</b></span>' +
              '</label>' +
              '<label class="dms-cell">' +
                '<input type="text" inputmode="decimal" autocomplete="off" data-row="' + index + '" data-part="m" value="' + escapeHtml(row.m) + '" aria-label="第 ' + (index + 1) + ' 个角的分">' +
                '<span>分 <b>′</b></span>' +
              '</label>' +
              '<label class="dms-cell">' +
                '<input type="text" inputmode="decimal" autocomplete="off" data-row="' + index + '" data-part="s" value="' + escapeHtml(row.s) + '" aria-label="第 ' + (index + 1) + ' 个角的秒">' +
                '<span>秒 <b>″</b></span>' +
              '</label>' +
            '</div>' +
            '<span class="trav-row-corr">—</span>' +
          '</div>';
      }).join("");
      list.innerHTML = html;
      countOut.textContent = String(travState.n);
      minus.disabled = travState.n <= 3;
      plus.disabled = travState.n >= 20;
    }

    function clearResult(reason) {
      travState.result = null;
      setText("trav-closure-out", "—");
      setText("trav-closure-dms", reason || "输入内角后自动检核");
      setText("trav-tolerance-out", "—");
      setText("trav-correction-out", "—");
      setText("trav-n-out", String(travState.n));
      setText("trav-corrected-sum", "—");
      setText("trav-sum-inline", "—");
      setText("trav-theory-inline", "—");
      setText("trav-verdict-note", reason || "请输入全部内角。");
      var stamp = $("#trav-verdict");
      stamp.textContent = "待检核";
      stamp.className = "verdict-stamp is-neutral";
      $("#trav-table").innerHTML = '<div class="corr-row corr-head"><span>#</span><span>观测值</span><span>改正</span><span>改正后</span></div>';
      $$(".trav-row-corr").forEach(function (el) { el.textContent = "—"; });
      travState.copyText = "";
    }

    function update() {
      customWrap.hidden = grade.value !== "custom";
      countOut.textContent = String(travState.n);
      minus.disabled = travState.n <= 3;
      plus.disabled = travState.n >= 20;

      var blankIndex = travState.angles.findIndex(function (row) {
        return row.d.trim() === "" && row.m.trim() === "" && row.s.trim() === "";
      });
      if (blankIndex !== -1) {
        clearResult("请填写第 " + (blankIndex + 1) + " 个内角，或减少角数。");
        return;
      }
      var values = travState.angles.map(rowValue);
      if (values.some(function (value) { return !Number.isFinite(value); })) {
        clearResult("存在无法识别的角度，请检查输入。");
        return;
      }
      var coef = coefficient();
      if (!Number.isFinite(coef)) {
        clearResult("请输入大于 0 的容许值系数。");
        return;
      }

      var result = A.traverseClosure(values, coef);
      if (!result.valid) {
        clearResult(result.reason);
        return;
      }
      travState.result = result;

      setText("trav-closure-out", A.formatSignedSeconds(result.closureSeconds, 1));
      var closureDirection = Math.abs(result.closureSeconds) < 0.05
        ? "闭合差为零"
        : (result.closureSeconds > 0 ? "观测和偏大" : "观测和偏小");
      setText("trav-closure-dms", fmtSignedDms(result.closure) + " · " + closureDirection);
      setText("trav-tolerance-out", "±" + result.toleranceSeconds.toFixed(1) + "″");
      setText("trav-correction-out", A.formatSignedSeconds(result.correctionSeconds, 1));
      setText("trav-n-out", String(result.n));
      setText("trav-corrected-sum", fmtDms(result.correctedSum));
      setText("trav-sum-inline", fmtDms(result.measuredSum));
      setText("trav-theory-inline", fmtDms(result.theoreticalSum));

      var stamp = $("#trav-verdict");
      stamp.textContent = result.passed ? "合格" : "超限";
      stamp.className = "verdict-stamp " + (result.passed ? "is-pass" : "is-fail");
      setText(
        "trav-verdict-note",
        result.passed
          ? "闭合差在容许范围内，可按相反符号将改正数平均分配到各观测角。"
          : "闭合差超限（|fβ| > 容许值），应检查观测记录并重测。下方改正仅作数学演示。"
      );

      $$(".trav-row-corr").forEach(function (el) {
        el.textContent = A.formatSignedSeconds(result.correctionSeconds, 1);
      });

      var tableHtml = '<div class="corr-row corr-head"><span>#</span><span>观测值</span><span>改正</span><span>改正后</span></div>';
      var copyLines = ["序号\t观测内角\t改正数\t改正后角度"];
      result.angles.forEach(function (angle, index) {
        var measured = fmtDms(angle);
        var corrected = fmtDms(result.corrected[index]);
        var correction = A.formatSignedSeconds(result.correctionSeconds, 1);
        tableHtml += '<div class="corr-row">' +
          '<span>' + (index + 1) + '</span>' +
          '<span class="corr-dms">' + measured + '</span>' +
          '<span class="corr-v">' + correction + '</span>' +
          '<span class="corr-dms">' + corrected + '</span>' +
          '</div>';
        copyLines.push((index + 1) + "\t" + measured + "\t" + correction + "\t" + corrected);
      });
      $("#trav-table").innerHTML = tableHtml;
      travState.copyText = copyLines.join("\n");
    }

    function setCount(next) {
      var target = Math.max(3, Math.min(20, next));
      if (target === travState.n) return;
      while (travState.angles.length < target) travState.angles.push(blankRow());
      travState.angles.length = target;
      travState.n = target;
      renderRows();
      update();
    }

    list.addEventListener("input", function (event) {
      var input = event.target.closest("input[data-part]");
      if (!input) return;
      var row = Number(input.dataset.row);
      var part = input.dataset.part;
      if (!travState.angles[row] || ["d", "m", "s"].indexOf(part) === -1) return;
      travState.angles[row][part] = input.value;
      update();
    });

    minus.addEventListener("click", function () { setCount(travState.n - 1); });
    plus.addEventListener("click", function () { setCount(travState.n + 1); });

    grade.addEventListener("change", function () {
      customWrap.hidden = grade.value !== "custom";
      update();
    });

    custom.addEventListener("input", update);

    $("#trav-reset").addEventListener("click", function () {
      travState.angles = Array.from({ length: travState.n }, blankRow);
      renderRows();
      update();
      var first = list.querySelector("input");
      if (first) first.focus();
    });

    $("#trav-sample").addEventListener("click", function () {
      travState.n = 5;
      travState.angles = TRAVERSE_SAMPLE.map(function (row) {
        return { d: row.d, m: row.m, s: row.s };
      });
      grade.value = "40";
      custom.value = "40";
      customWrap.hidden = true;
      renderRows();
      update();
    });

    $("#trav-copy-table").addEventListener("click", function () {
      if (!travState.copyText) {
        showToast("暂无可复制的改正表");
        return;
      }
      copyText(travState.copyText, $("#trav-copy-table"));
    });

    saveBuilders.traverse = function () {
      var result = travState.result;
      if (!result) return null;
      return {
        value: "fβ " + A.formatSignedSeconds(result.closureSeconds, 1),
        meta: "n=" + result.n + " · 容许 ±" + result.toleranceSeconds.toFixed(1) + "″ · " + (result.passed ? "合格" : "超限")
      };
    };

    renderRows();
    update();
  }

  /* ------------------------------------------------------------------------
     History
     ------------------------------------------------------------------------ */

  var HISTORY_KEY = "gonlab.history.v1";
  var historyItems = [];

  function loadHistory() {
    try {
      var raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && typeof item.value === "string" && TOOL_META[item.tool];
      }).slice(0, 30);
    } catch (error) {
      return [];
    }
  }

  function persistHistory() {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
    } catch (error) {
      /* Private mode or file:// restrictions: keep the in-memory list working. */
    }
  }

  function updateHistoryBadge() {
    var badge = $("#history-count");
    if (!badge) return;
    badge.textContent = String(historyItems.length);
    badge.hidden = historyItems.length === 0;
  }

  function formatHistoryTime(iso) {
    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function renderHistory() {
    var list = $("#history-list");
    if (!list) return;
    if (!historyItems.length) {
      list.innerHTML = '<div class="history-empty"><strong>还没有记录</strong><p>在每个工具的“＋ 记录”按钮上点一下，结果就会保存在当前浏览器里。</p></div>';
      return;
    }
    list.innerHTML = historyItems.map(function (item) {
      var meta = TOOL_META[item.tool];
      return '<article class="history-item">' +
        '<div class="history-item-main">' +
          '<div class="history-item-top">' +
            '<button class="history-tool" type="button" data-history-view="' + item.tool + '" style="background:' + meta.color + '">' + escapeHtml(meta.name) + ' →</button>' +
            '<span class="history-time">' + escapeHtml(formatHistoryTime(item.createdAt)) + '</span>' +
          '</div>' +
          '<strong class="history-value">' + escapeHtml(item.value) + '</strong>' +
          '<span class="history-meta">' + escapeHtml(item.meta || "") + '</span>' +
        '</div>' +
        '<div class="history-item-actions">' +
          '<button class="mini-btn history-mini" type="button" data-history-copy="' + escapeHtml(item.id) + '">复制</button>' +
          '<button class="history-delete" type="button" data-history-delete="' + escapeHtml(item.id) + '">删除</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function addHistory(tool, value, meta) {
    if (!TOOL_META[tool] || !value || value === "—") {
      showToast("暂无可保存的结果");
      return;
    }
    historyItems.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      tool: tool,
      value: value,
      meta: meta || "",
      createdAt: new Date().toISOString()
    });
    historyItems = historyItems.slice(0, 30);
    persistHistory();
    updateHistoryBadge();
    renderHistory();
    showToast("已保存到本地记录");
  }

  function openHistory() {
    var dialog = $("#history-dialog");
    if (!dialog) return;
    renderHistory();
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("dialog-open");
  }

  function closeHistory() {
    var dialog = $("#history-dialog");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    document.body.classList.remove("dialog-open");
  }

  function initHistory() {
    historyItems = loadHistory();
    updateHistoryBadge();

    $("#history-open").addEventListener("click", openHistory);
    $("#history-close").addEventListener("click", closeHistory);

    $("#history-dialog").addEventListener("close", function () {
      document.body.classList.remove("dialog-open");
    });

    $("#history-dialog").addEventListener("click", function (event) {
      if (event.target === this) closeHistory();
    });

    $("#history-clear").addEventListener("click", function () {
      if (!historyItems.length) {
        showToast("记录已经是空的");
        return;
      }
      if (window.confirm("确定清空全部本地记录吗？此操作不可撤销。")) {
        historyItems = [];
        persistHistory();
        updateHistoryBadge();
        renderHistory();
        showToast("本地记录已清空");
      }
    });

    $("#history-list").addEventListener("click", function (event) {
      var copyButton = event.target.closest("[data-history-copy]");
      if (copyButton) {
        var copyItem = historyItems.find(function (item) { return item.id === copyButton.dataset.historyCopy; });
        if (copyItem) copyText(copyItem.value, copyButton);
        return;
      }

      var deleteButton = event.target.closest("[data-history-delete]");
      if (deleteButton) {
        historyItems = historyItems.filter(function (item) { return item.id !== deleteButton.dataset.historyDelete; });
        persistHistory();
        updateHistoryBadge();
        renderHistory();
        showToast("记录已删除");
        return;
      }

      var viewButton = event.target.closest("[data-history-view]");
      if (viewButton) {
        var view = viewButton.dataset.historyView;
        closeHistory();
        if (TOOL_META[view]) {
          window.location.hash = view;
        }
      }
    });

    document.addEventListener("click", function (event) {
      var copyButton = event.target.closest("[data-copy-target]");
      if (copyButton) {
        var target = document.getElementById(copyButton.dataset.copyTarget);
        if (target) copyText(target.textContent, copyButton);
        return;
      }

      var saveButton = event.target.closest(".js-save[data-tool]");
      if (saveButton) {
        var tool = saveButton.dataset.tool;
        var builder = saveBuilders[tool];
        var data = builder ? builder() : null;
        if (!data) {
          showToast("暂无可保存的有效结果");
          return;
        }
        addHistory(tool, data.value, data.meta);
      }
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  initNavigation();
  initConverter();
  initOperations();
  initAzimuth();
  initIncluded();
  initTraverse();
  initHistory();
})();
