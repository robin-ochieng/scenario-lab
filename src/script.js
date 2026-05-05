(function () {
    "use strict";

    var baseline = { client: "", lob: "", valuationDate: "", gwp: 0, earnedPremium: 0, policyCount: 0, currentFrequency: 0, currentSeverity: 0, currentLossRatio: 0, targetLossRatio: 65, currentExpenseRatio: 15, targetExpenseRatio: 13, currentCommissionRatio: 10, targetCommissionRatio: 8, reservePosition: 50, discountRate: 12.5, riskMarginPct: 6, volatility: 18 };
    var state = {
        freqShock: 0,
        sevShock: 0,
        rateShock: 0,
        expRatio: baseline.currentExpenseRatio,
        commRatio: baseline.currentCommissionRatio,
        tab: "exposure"
    };

    var FIELD_KEYS = ["client", "lob", "valuationDate", "gwp", "earnedPremium", "policyCount", "currentFrequency", "currentSeverity", "currentLossRatio", "targetLossRatio", "currentExpenseRatio", "targetExpenseRatio", "currentCommissionRatio", "targetCommissionRatio", "reservePosition", "discountRate", "riskMarginPct", "volatility"];
    var NUMERIC_FIELD_KEYS = ["gwp", "earnedPremium", "policyCount", "currentFrequency", "currentSeverity", "currentLossRatio", "targetLossRatio", "currentExpenseRatio", "targetExpenseRatio", "currentCommissionRatio", "targetCommissionRatio", "reservePosition", "discountRate", "riskMarginPct", "volatility"];
    var QUARTER_LABELS = ["Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26", "Q2 '26", "Q3 '26", "Q4 '26", "Q1 '27"];

    function byId(id) { return document.getElementById(id); }
    function formatNumber(v) { return Number(v).toLocaleString(); }
    function round1(v) { return Math.round(v * 10) / 10; }

    function projectScenario(b, p) {
        var freq = b.currentFrequency || 1, sev = b.currentSeverity || 1, earned = b.earnedPremium || 1, policies = b.policyCount || 1;
        var freqMul = 1 + p.freqShock / 100, sevMul = 1 + p.sevShock / 100, rateMul = 1 + p.rateShock / 100;
        var expRatio = p.expRatio, commRatio = p.commRatio;
        var totalExpense = expRatio + commRatio;
        var quarters = [];
        for (var q = 0; q <= 8; q++) {
            if (q === 0) {
                quarters.push({
                    label: "Now",
                    lossRatio: b.currentLossRatio,
                    expRatio: b.currentExpenseRatio,
                    commRatio: b.currentCommissionRatio,
                    combinedRatio: round1(b.currentLossRatio + b.currentExpenseRatio + b.currentCommissionRatio),
                    incurred: Math.round((b.currentLossRatio / 100) * (earned / 4)),
                    earned: Math.round(earned / 4),
                    freq: freq,
                    sev: sev,
                    written: Math.round(b.gwp / 4)
                });
            } else {
                var rateAccum = Math.pow(rateMul, q / 4);
                var earnedQ = (earned / 4) * rateAccum;
                var blend = Math.min(q / 4, 1);
                var freqQ = freq * (1 - blend) + freq * freqMul * blend;
                var sevQ = sev * (1 - blend) + sev * sevMul * blend;
                var incurredQ = ((policies / 1000) * freqQ * sevQ) / 1000;
                var lossRatioQ = Math.max(0, Math.min(150, (incurredQ / earnedQ) * 100));
                quarters.push({
                    label: QUARTER_LABELS[q - 1],
                    lossRatio: round1(lossRatioQ),
                    expRatio: expRatio,
                    commRatio: commRatio,
                    combinedRatio: round1(lossRatioQ + totalExpense),
                    incurred: Math.round(incurredQ),
                    earned: Math.round(earnedQ),
                    freq: round1(freqQ),
                    sev: Math.round(sevQ),
                    written: Math.round((b.gwp / 4) * rateAccum)
                });
            }
        }

        var uprGep = quarters.map(function (q, i) {
            var w = q.written;
            var u = Math.round(w * Math.max(0.08, 0.55 - i * 0.05));
            return { label: q.label, lossRatio: q.lossRatio, expRatio: q.expRatio, commRatio: q.commRatio, combinedRatio: q.combinedRatio, incurred: q.incurred, earned: q.earned, freq: q.freq, sev: q.sev, written: w, gep: w - u, upr: u };
        });

        var next4Earned = 0, next4Claims = 0;
        for (var i = 1; i <= 4; i++) { next4Earned += quarters[i].earned; next4Claims += quarters[i].incurred; }
        var next4Expense = next4Earned * (totalExpense / 100);
        var underwritingResult = Math.round(next4Earned - next4Claims - next4Expense);
        var fulfilmentCF = Math.round(next4Claims + next4Expense);

        var discountFactor = 1 / Math.pow(1 + (b.discountRate || 12.5) / 100, 1);
        var pvFulfilment = Math.round(fulfilmentCF * discountFactor);
        var riskAdjustment = Math.round(pvFulfilment * (b.riskMarginPct || 6) / 100);

        var csmImpact = underwritingResult > 0 ? Math.round(underwritingResult * 0.45) : Math.round(underwritingResult * 0.6);
        var csmInitial = Math.max(0, Math.round(next4Earned * discountFactor) - pvFulfilment - riskAdjustment);
        var isOnerous = (csmInitial + csmImpact <= 0) && (csmImpact < 0);

        var avgLossRatio = 0;
        for (var j = 1; j <= 4; j++) avgLossRatio += quarters[j].lossRatio;
        avgLossRatio /= 4;
        var lrcStrength = Math.max(5, Math.min(95, Math.round((b.reservePosition || 50) + (avgLossRatio - b.currentLossRatio) * -0.8)));

        var lrcQuarters = quarters.map(function (q, i) {
            var cumE = 0, cumCl = 0;
            for (var k = 0; k <= i; k++) { cumE += quarters[k].earned; cumCl += quarters[k].incurred; }
            var cumX = cumE * (totalExpense / 100);
            var qFulfilment = Math.round((cumCl + cumX) * discountFactor);
            var qRA = Math.round(qFulfilment * (b.riskMarginPct || 6) / 100);
            return { label: q.label, fcf: qFulfilment, ra: qRA, csm: Math.max(0, Math.round(cumE * discountFactor) - qFulfilment - qRA) };
        });

        var vol = (b.volatility || 18) / 100;
        var CONFIDENCE_LEVELS = [{ label: "75th", z: 0.674 }, { label: "85th", z: 1.036 }, { label: "95th", z: 1.645 }];
        var riskBands = quarters.map(function (q, i) {
            var bestEstimate = q.incurred;
            var o = { label: q.label, incurred: bestEstimate };
            CONFIDENCE_LEVELS.forEach(function (c) {
                var spread = bestEstimate * vol * c.z * Math.sqrt((i + 1) / 4);
                o["u" + c.label] = Math.round(bestEstimate + spread);
                o["d" + c.label] = Math.round(Math.max(0, bestEstimate - spread));
            });
            return o;
        });
        var riskAdjustments = CONFIDENCE_LEVELS.map(function (c) {
            var excess = 0;
            for (var i = 1; i <= 4; i++) excess += riskBands[i]["u" + c.label] - riskBands[i].incurred;
            return { percentile: c.label, amount: Math.round(excess) };
        });

        return { quarters: quarters, uprGep: uprGep, lrcQuarters: lrcQuarters, riskBands: riskBands, csmImpact: csmImpact, isOnerous: isOnerous, pvFulfilment: pvFulfilment, riskAdjustment: riskAdjustment, fulfilmentCF: fulfilmentCF, underwritingResult: underwritingResult, lrcStrength: lrcStrength, next4Earned: next4Earned, riskAdjustments: riskAdjustments };
    }

    var SVG_NS = "http://www.w3.org/2000/svg";
    var CHART_W = 540, CHART_H_DEFAULT = 205, CHART_H_RISK = 210;
    var PAD_L = 42, PAD_R = 12, PAD_T = 18, PAD_B = 34;

    function chartWidth() { return CHART_W - PAD_L - PAD_R; }
    function chartHeight(h) { return (h || CHART_H_DEFAULT) - PAD_T - PAD_B; }

    function svgEl(tag, attrs) {
        var e = document.createElementNS(SVG_NS, tag);
        if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        return e;
    }
    function svgText(x, y, text, opts) {
        opts = opts || {};
        var e = svgEl("text", { x: x, y: y, "text-anchor": opts.anchor || "middle" });
        e.textContent = text;
        e.style.cssText = "font-size:" + (opts.size || "9px") + ";fill:" + (opts.fill || "#8A9BB0") + ";font-family:'Outfit',sans-serif;font-weight:" + (opts.weight || "400");
        return e;
    }
    function clearSvg(s, h) {
        while (s.firstChild) s.removeChild(s.firstChild);
        s.setAttribute("viewBox", "0 0 " + CHART_W + " " + (h || CHART_H_DEFAULT));
    }

    function drawExposure(svg, data, baselineData) {
        clearSvg(svg);
        var min = 40, max = 130;
        var targetLossRatio = baseline.targetLossRatio || 65;
        var targetCombined = (baseline.targetLossRatio || 65) + (baseline.targetExpenseRatio || 12) + (baseline.targetCommissionRatio || 8);
        var toX = function (i) { return PAD_L + (i / (data.length - 1)) * chartWidth(); };
        var toY = function (v) { return PAD_T + (1 - (Math.min(Math.max(v, min), max) - min) / (max - min)) * chartHeight(); };
        var makePath = function (arr, key) {
            return arr.map(function (q, i) { return (i ? 'L' : 'M') + ' ' + toX(i) + ' ' + toY(q[key]); }).join(' ');
        };

        var finalLoss = data[data.length - 1].lossRatio;
        var finalCombined = data[data.length - 1].combinedRatio;
        var lossColor = finalLoss <= targetLossRatio ? "#1B9C85" : finalLoss <= 75 ? "#D4900D" : "#C23B22";
        var combinedColor = finalCombined <= targetCombined ? "#1B9C85" : finalCombined <= 100 ? "#D4900D" : "#C23B22";

        [targetLossRatio, 80, 100, 120].forEach(function (v) {
            svg.appendChild(svgEl("line", {
                x1: PAD_L, x2: CHART_W - PAD_R, y1: toY(v), y2: toY(v),
                stroke: v === 100 ? "rgba(194,59,34,.25)" : v === targetLossRatio ? "rgba(13,139,125,.3)" : "#EEF1F4",
                "stroke-width": (v === 100 || v === targetLossRatio) ? 1.5 : 1,
                "stroke-dasharray": (v === 100 || v === targetLossRatio) ? "5 3" : "none"
            }));
            svg.appendChild(svgText(PAD_L - 6, toY(v) + 3, v + "%", {
                anchor: "end",
                fill: v === 100 ? "#C23B22" : v === targetLossRatio ? "#0D8B7D" : "#8A9BB0",
                weight: (v === 100 || v === targetLossRatio) ? "700" : "400"
            }));
        });

        var defs = svgEl("defs"), gradient = svgEl("linearGradient", { id: "aG", x1: "0", y1: "0", x2: "0", y2: "1" });
        gradient.appendChild(svgEl("stop", { offset: "0%", "stop-color": combinedColor, "stop-opacity": "0.07" }));
        gradient.appendChild(svgEl("stop", { offset: "100%", "stop-color": combinedColor, "stop-opacity": "0.01" }));
        defs.appendChild(gradient);
        svg.appendChild(defs);

        var combinedPath = makePath(data, "combinedRatio");
        svg.appendChild(svgEl("path", {
            d: combinedPath + " L " + toX(data.length - 1) + " " + toY(min) + " L " + toX(0) + " " + toY(min) + " Z",
            fill: "url(#aG)"
        }));
        if (baselineData) {
            svg.appendChild(svgEl("path", {
                d: makePath(baselineData, "lossRatio"),
                fill: "none", stroke: "#8A9BB0", "stroke-width": "1.5", "stroke-dasharray": "4 3", opacity: "0.3"
            }));
        }
        svg.appendChild(svgEl("path", {
            d: combinedPath, fill: "none", stroke: combinedColor, "stroke-width": "1.5", opacity: "0.45", "stroke-linecap": "round"
        }));
        svg.appendChild(svgEl("path", {
            d: makePath(data, "lossRatio"), fill: "none", stroke: lossColor, "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round"
        }));

        data.forEach(function (q, i) {
            var endpoint = i === 0 || i === data.length - 1;
            svg.appendChild(svgEl("circle", {
                cx: toX(i), cy: toY(q.lossRatio), r: endpoint ? 4.5 : 2,
                fill: "#fff", stroke: lossColor, "stroke-width": "2"
            }));
            svg.appendChild(svgText(toX(i), CHART_H_DEFAULT - 8, q.label, { size: "8px" }));
            if (endpoint) {
                svg.appendChild(svgText(toX(i), toY(q.lossRatio) - 11, q.lossRatio + "%", {
                    size: "10px", weight: "800", fill: lossColor
                }));
            }
        });
    }

    function drawUprGep(svg, data) {
        clearSvg(svg);
        var max = 0;
        data.forEach(function (q) { if (q.written > max) max = q.written; });
        max *= 1.15;
        if (max <= 0) max = 100;
        var toX = function (i) { return PAD_L + (i / Math.max(data.length - 1, 1)) * chartWidth(); };
        var toY = function (v) { return PAD_T + (1 - v / max) * chartHeight(); };
        var barW = chartWidth() / data.length * 0.65;

        [0.25, 0.5, 0.75, 1].forEach(function (p) {
            var v = Math.round(max * p);
            svg.appendChild(svgEl("line", { x1: PAD_L, x2: CHART_W - PAD_R, y1: toY(v), y2: toY(v), stroke: "#EEF1F4" }));
            svg.appendChild(svgText(PAD_L - 6, toY(v) + 3, "" + v, { anchor: "end", size: "8px" }));
        });

        data.forEach(function (q, i) {
            var x = toX(i) - barW / 2;
            svg.appendChild(svgEl("rect", { x: x, y: toY(q.gep + q.upr), width: barW * 0.46, height: Math.max((q.gep + q.upr) / max * chartHeight(), 1), rx: "2", fill: "#0D8B7D", opacity: "0.12" }));
            svg.appendChild(svgEl("rect", { x: x, y: toY(q.gep), width: barW * 0.46, height: Math.max(q.gep / max * chartHeight(), 1), rx: "2", fill: "#0D8B7D" }));
            svg.appendChild(svgEl("rect", { x: x + barW * 0.54, y: toY(q.upr), width: barW * 0.46, height: Math.max(q.upr / max * chartHeight(), 1), rx: "2", fill: "#D4900D", opacity: "0.6" }));
            svg.appendChild(svgText(toX(i), CHART_H_DEFAULT - 8, q.label, { size: "8px" }));
        });
    }

    function drawLrc(svg, data) {
        clearSvg(svg);
        var max = 0;
        data.forEach(function (q) { var t = q.fcf + q.ra + q.csm; if (t > max) max = t; });
        max *= 1.2;
        if (max <= 0) max = 100;
        var toX = function (i) { return PAD_L + (i / Math.max(data.length - 1, 1)) * chartWidth(); };
        var toY = function (v) { return PAD_T + (1 - v / max) * chartHeight(); };
        var barW = chartWidth() / data.length * 0.5;

        [0.25, 0.5, 0.75].forEach(function (p) {
            var v = Math.round(max * p);
            svg.appendChild(svgEl("line", { x1: PAD_L, x2: CHART_W - PAD_R, y1: toY(v), y2: toY(v), stroke: "#EEF1F4" }));
            svg.appendChild(svgText(PAD_L - 6, toY(v) + 3, "" + v, { anchor: "end", size: "8px" }));
        });

        data.forEach(function (q, i) {
            var x = toX(i) - barW / 2;
            svg.appendChild(svgEl("rect", { x: x, y: toY(q.fcf), width: barW, height: Math.max(q.fcf / max * chartHeight(), 1), rx: "2", fill: "#0F2B46", opacity: "0.7" }));
            svg.appendChild(svgEl("rect", { x: x, y: toY(q.fcf + q.ra), width: barW, height: Math.max(q.ra / max * chartHeight(), 1), rx: "2", fill: "#7B5EA7", opacity: "0.6" }));
            if (q.csm > 0) {
                svg.appendChild(svgEl("rect", { x: x, y: toY(q.fcf + q.ra + q.csm), width: barW, height: Math.max(q.csm / max * chartHeight(), 1), rx: "2", fill: "#0D8B7D", opacity: "0.7" }));
            }
            svg.appendChild(svgText(toX(i), CHART_H_DEFAULT - 8, q.label, { size: "8px" }));
        });
    }

    function drawRisk(svg, data) {
        clearSvg(svg, CHART_H_RISK);
        var values = [];
        data.forEach(function (q) {
            values.push(q.incurred);
            if (q.u95th) values.push(q.u95th);
            if (q.d95th) values.push(q.d95th);
        });
        values = values.filter(function (v) { return v > 0; });
        if (values.length < 2) values = [0, 100];
        var min = Math.min.apply(null, values) * 0.65, max = Math.max.apply(null, values) * 1.2;
        if (max <= min) max = min + 100;
        var toX = function (i) { return PAD_L + (i / (data.length - 1)) * chartWidth(); };
        var toY = function (v) { return PAD_T + (1 - (v - min) / (max - min)) * chartHeight(CHART_H_RISK); };

        [0.25, 0.5, 0.75].forEach(function (p) {
            var v = Math.round(min + (max - min) * p);
            svg.appendChild(svgEl("line", { x1: PAD_L, x2: CHART_W - PAD_R, y1: toY(v), y2: toY(v), stroke: "#EEF1F4" }));
            svg.appendChild(svgText(PAD_L - 6, toY(v) + 3, "" + v, { anchor: "end", size: "8px" }));
        });

        function band(upKey, downKey, color, opacity) {
            var up = data.map(function (q, i) { return (i ? 'L' : 'M') + ' ' + toX(i) + ' ' + toY(q[upKey] || q.incurred); }).join(' ');
            var down = data.slice().reverse().map(function (q, i) { return 'L ' + toX(data.length - 1 - i) + ' ' + toY(q[downKey] || q.incurred); }).join(' ');
            svg.appendChild(svgEl("path", { d: up + ' ' + down + ' Z', fill: color, opacity: opacity }));
        }
        band("u95th", "d95th", "#C23B22", "0.08");
        band("u85th", "d85th", "#D4900D", "0.1");
        band("u75th", "d75th", "#7B5EA7", "0.12");

        var bestPath = data.map(function (q, i) { return (i ? 'L' : 'M') + ' ' + toX(i) + ' ' + toY(q.incurred); }).join(' ');
        svg.appendChild(svgEl("path", { d: bestPath, fill: "none", stroke: "#0F2B46", "stroke-width": "2.5", "stroke-linecap": "round" }));

        data.forEach(function (q, i) {
            svg.appendChild(svgEl("circle", {
                cx: toX(i), cy: toY(q.incurred),
                r: (i === 0 || i === data.length - 1) ? 4 : 2,
                fill: "#fff", stroke: "#0F2B46", "stroke-width": "2"
            }));
            svg.appendChild(svgText(toX(i), CHART_H_RISK - 8, q.label, { size: "8px" }));
        });
    }

    function renderLegend(items) {
        var c = byId("chartLegend");
        c.innerHTML = "";
        items.forEach(function (it) {
            var d = document.createElement("div");
            d.className = "leg";
            d.innerHTML = '<div class="leg-b" style="background:' + it.c + ';opacity:' + (it.o || 1) + '"></div>' + it.t;
            c.appendChild(d);
        });
    }

    function renderKpis(cards) {
        var c = byId("kpiRow");
        c.innerHTML = "";
        cards.forEach(function (k) {
            var d = document.createElement("div");
            d.className = "k " + k.st;
            d.innerHTML = '<div class="k-l">' + k.lb + '</div>' + (k.sl ? '<div class="k-s">' + k.sl + '</div>' : '') + '<div class="k-n">' + k.v + '</div><div class="k-t">' + k.tx + '</div>';
            c.appendChild(d);
        });
    }

    function viewExposure(scenario, baselineProj) {
        byId("chartTitle").textContent = "Loss Ratio & Combined Ratio — 8 Quarter Projection";
        drawExposure(byId("chart"), scenario.quarters, baselineProj.quarters);

        var f = scenario.quarters[8];
        var targetLR = baseline.targetLossRatio || 65;
        var targetCombined = (baseline.targetLossRatio || 65) + (baseline.targetExpenseRatio || 12) + (baseline.targetCommissionRatio || 8);
        var lossColor = f.lossRatio <= targetLR ? "#1B9C85" : f.lossRatio <= 75 ? "#D4900D" : "#C23B22";

        renderLegend([
            { c: lossColor, t: "Loss Ratio" },
            { c: f.combinedRatio <= targetCombined ? "#1B9C85" : "#D4900D", t: "Combined Ratio", o: 0.5 },
            { c: "#8A9BB0", t: "Current trajectory", o: 0.4 }
        ]);

        renderKpis([
            { lb: "Loss Ratio", v: f.lossRatio + "%", tx: "Target: " + targetLR + "%", st: f.lossRatio <= targetLR ? "green" : f.lossRatio <= 75 ? "amber" : "red" },
            { lb: "Expense Ratio", v: f.expRatio + "%", tx: "Target: " + (baseline.targetExpenseRatio || 12) + "%", st: f.expRatio <= (baseline.targetExpenseRatio || 12) ? "green" : f.expRatio <= (baseline.targetExpenseRatio || 12) + 3 ? "amber" : "red" },
            { lb: "Commission Ratio", v: f.commRatio + "%", tx: "Target: " + (baseline.targetCommissionRatio || 8) + "%", st: f.commRatio <= (baseline.targetCommissionRatio || 8) ? "green" : f.commRatio <= (baseline.targetCommissionRatio || 8) + 2 ? "amber" : "red" },
            { lb: "Combined Ratio", v: f.combinedRatio + "%", tx: "Target: " + round1(targetCombined) + "%", st: f.combinedRatio <= targetCombined ? "green" : f.combinedRatio <= 100 ? "amber" : "red" }
        ]);

        byId("insightTitle").textContent = "Underwriting Insight";
        byId("insightBody").textContent = f.combinedRatio < 100
            ? "Under these assumptions, " + baseline.client + "'s " + baseline.lob + " book remains profitable with a combined ratio of " + f.combinedRatio + "% (target: " + round1(targetCombined) + "%). " + (f.lossRatio <= targetLR ? "The loss ratio returns to target." : "The loss ratio remains above " + targetLR + "% — further intervention may be needed.")
            : "The combined ratio exceeds 100% at " + f.combinedRatio + "%, indicating underwriting losses for " + baseline.client + ". The target is " + round1(targetCombined) + "%. Without intervention, this may trigger onerous contract recognition under IFRS 17.";
    }

    function viewUprGep(scenario) {
        byId("chartTitle").textContent = "Premium Earning Pattern — GWP, GEP & UPR";
        drawUprGep(byId("chart"), scenario.uprGep);
        renderLegend([
            { c: "#0D8B7D", t: "GEP (Earned)" },
            { c: "#D4900D", t: "UPR (Unearned)", o: 0.6 },
            { c: "#0D8B7D", t: "GWP (Written)", o: 0.15 }
        ]);
        var totalGep = 0, totalGwp = 0;
        for (var i = 1; i <= 4; i++) { totalGep += scenario.uprGep[i].gep; totalGwp += scenario.uprGep[i].written; }
        renderKpis([
            { lb: "GWP (Next 4Q)", v: "KES " + formatNumber(totalGwp) + "M", tx: "Written premium", st: "green" },
            { lb: "GEP (Next 4Q)", v: "KES " + formatNumber(totalGep) + "M", tx: "Earned premium", st: "green" },
            { lb: "UPR (End Q4)", v: "KES " + scenario.uprGep[4].upr + "M", tx: "Unearned reserve", st: "amber" }
        ]);
        byId("insightTitle").textContent = "Premium Earning Insight";
        byId("insightBody").textContent = "Under the assumed rate change, total earned premium for " + baseline.client + " over the next four quarters is projected at KES " + formatNumber(totalGep) + "M. The earning pattern creates a timing lag between pricing action and its financial impact.";
    }

    function viewLrc(scenario) {
        byId("chartTitle").textContent = "IFRS 17 Liability for Remaining Coverage";
        drawLrc(byId("chart"), scenario.lrcQuarters);
        renderLegend([
            { c: "#0F2B46", t: "PV Fulfilment CF", o: 0.7 },
            { c: "#7B5EA7", t: "Risk Adjustment", o: 0.6 },
            { c: "#0D8B7D", t: "CSM", o: 0.7 }
        ]);
        var cards = [
            { lb: "CSM Impact", sl: "Contractual Service Margin", v: "KES " + Math.abs(scenario.csmImpact) + "M", tx: scenario.csmImpact >= 0 ? "Accretion" : "Erosion", st: scenario.csmImpact > 50 ? "green" : scenario.csmImpact > 0 ? "amber" : "red" },
            { lb: "LRC Strength", sl: "Liability Adequacy", v: scenario.lrcStrength + "th pctl", tx: scenario.lrcStrength >= 50 ? "Adequate" : "Monitor", st: scenario.lrcStrength >= 55 ? "green" : scenario.lrcStrength >= 40 ? "amber" : "red" },
            { lb: "Fulfilment CF", sl: "PV Future Obligations", v: "KES " + scenario.pvFulfilment + "M", tx: "Disc. @ " + (baseline.discountRate || 12.5) + "%", st: "purple" }
        ];
        if (scenario.isOnerous) cards.push({ lb: "Onerous", sl: "Contract Status", v: "WARNING", tx: "CSM exhausted", st: "red" });
        renderKpis(cards);

        byId("insightTitle").textContent = "IFRS 17 Liability Insight";
        byId("insightBody").textContent = scenario.csmImpact >= 0
            ? "The CSM is projected to strengthen by KES " + scenario.csmImpact + "M for " + baseline.client + ". LRC at the " + scenario.lrcStrength + "th percentile" + (scenario.lrcStrength >= 50 ? " indicates adequate coverage." : " warrants monitoring.")
            : "The CSM is projected to erode by KES " + Math.abs(scenario.csmImpact) + "M." + (scenario.isOnerous ? " Contracts risk becoming onerous under IFRS 17." : " Continued deterioration would risk onerous classification.");
    }

    function viewRisk(scenario) {
        byId("chartTitle").textContent = "Claims Sensitivity — Confidence Intervals";
        drawRisk(byId("chart"), scenario.riskBands);
        renderLegend([
            { c: "#0F2B46", t: "Best Estimate" },
            { c: "#7B5EA7", t: "75th pctl", o: 0.35 },
            { c: "#D4900D", t: "85th pctl", o: 0.25 },
            { c: "#C23B22", t: "95th pctl", o: 0.2 }
        ]);
        renderKpis(scenario.riskAdjustments.map(function (r, i) {
            return { lb: "RA @ " + r.percentile, sl: r.percentile + " percentile", v: "KES " + r.amount + "M", tx: "Above best estimate", st: i === 0 ? "purple" : i === 1 ? "amber" : "red" };
        }));
        byId("insightTitle").textContent = "Risk Sensitivity Insight";
        byId("insightBody").textContent = "At the 95th percentile, " + baseline.client + "'s claims could exceed best estimate by KES " + scenario.riskAdjustments[2].amount + "M. The widening bands illustrate compounding uncertainty — key for IFRS 17 risk adjustment calibration.";
    }

    function render() {
        var scenario = projectScenario(baseline, state);
        var baselineProj = projectScenario(baseline, {
            freqShock: 0,
            sevShock: 0,
            rateShock: 0,
            expRatio: baseline.currentExpenseRatio,
            commRatio: baseline.currentCommissionRatio
        });
        if (state.tab === "exposure") viewExposure(scenario, baselineProj);
        else if (state.tab === "uprGep") viewUprGep(scenario);
        else if (state.tab === "lrc") viewLrc(scenario);
        else viewRisk(scenario);
    }

    var SLIDERS = [
        { idSuffix: "freq", stateKey: "freqShock", signed: true },
        { idSuffix: "sev", stateKey: "sevShock", signed: true },
        { idSuffix: "rate", stateKey: "rateShock", signed: true },
        { idSuffix: "exp", stateKey: "expRatio", signed: false },
        { idSuffix: "comm", stateKey: "commRatio", signed: false }
    ];

    function updateSlider(s) {
        var input = byId("slider-" + s.idSuffix);
        var value = parseFloat(input.value);
        var min = parseFloat(input.min), max = parseFloat(input.max), step = parseFloat(input.step);
        var pct = ((value - min) / (max - min)) * 100;
        byId("fill-" + s.idSuffix).style.width = pct + "%";
        var display = s.signed && value > 0 ? "+" + value.toFixed(step < 1 ? 1 : 0) : value.toFixed(step < 1 ? 1 : 0);
        byId("value-" + s.idSuffix).textContent = display + "%";
    }

    function initSliders() {
        SLIDERS.forEach(function (s) {
            updateSlider(s);
            byId("slider-" + s.idSuffix).addEventListener("input", function () {
                state[s.stateKey] = parseFloat(this.value);
                updateSlider(s);
                render();
            });
        });
    }

    function resetSliders() {
        state.freqShock = 0;
        state.sevShock = 0;
        state.rateShock = 0;
        state.expRatio = baseline.currentExpenseRatio;
        state.commRatio = baseline.currentCommissionRatio;
        byId("slider-freq").value = 0;
        byId("slider-sev").value = 0;
        byId("slider-rate").value = 0;
        byId("slider-exp").value = baseline.currentExpenseRatio;
        byId("slider-comm").value = baseline.currentCommissionRatio;
        SLIDERS.forEach(updateSlider);
    }

    function configToForm(d) {
        FIELD_KEYS.forEach(function (k) {
            var e = byId("c-" + k);
            if (e) e.value = d[k] === undefined || d[k] === null ? "" : d[k];
        });
        updateCombinedRatios();
    }

    function formToConfig() {
        FIELD_KEYS.forEach(function (k) {
            var e = byId("c-" + k);
            if (!e) return;
            baseline[k] = NUMERIC_FIELD_KEYS.indexOf(k) >= 0 ? (parseFloat(e.value) || 0) : e.value;
        });
    }

    function updateCombinedRatios() {
        var currentLR = parseFloat(byId("c-currentLossRatio").value) || 0;
        var currentER = parseFloat(byId("c-currentExpenseRatio").value) || 0;
        var currentCR = parseFloat(byId("c-currentCommissionRatio").value) || 0;
        var targetLR = parseFloat(byId("c-targetLossRatio").value) || 0;
        var targetER = parseFloat(byId("c-targetExpenseRatio").value) || 0;
        var targetCR = parseFloat(byId("c-targetCommissionRatio").value) || 0;
        byId("c-currentCombinedRatio").value = round1(currentLR + currentER + currentCR);
        byId("c-targetCombinedRatio").value = round1(targetLR + targetER + targetCR);
    }

    function validate() {
        formToConfig();
        updateCombinedRatios();
        var ok = baseline.client && baseline.gwp > 0 && baseline.policyCount > 0 && baseline.currentFrequency > 0;
        byId("launchBtn").disabled = !ok;
        byId("launchHint").className = ok ? "lhint ok" : "lhint";
        return ok;
    }

    function showLabScene() {
        formToConfig();
        if (!validate()) return;
        state.freqShock = 0;
        state.sevShock = 0;
        state.rateShock = 0;
        state.expRatio = baseline.currentExpenseRatio;
        state.commRatio = baseline.currentCommissionRatio;
        state.tab = "exposure";
        byId("slider-freq").value = 0;
        byId("slider-sev").value = 0;
        byId("slider-rate").value = 0;
        byId("slider-exp").value = baseline.currentExpenseRatio;
        byId("slider-comm").value = baseline.currentCommissionRatio;
        SLIDERS.forEach(updateSlider);
        document.querySelectorAll(".t").forEach(function (t) { t.classList.remove("on"); });
        document.querySelector('[data-tab="exposure"]').classList.add("on");
        byId("labName").textContent = baseline.client;
        var dt = baseline.valuationDate ? new Date(baseline.valuationDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
        byId("labMeta").textContent = (baseline.lob || "") + " · GWP: KES " + formatNumber(baseline.gwp) + "M · " + formatNumber(baseline.policyCount) + " policies" + (dt ? " · " + dt : "");
        byId("scene-config").classList.add("hidden");
        byId("scene-lab").classList.remove("hidden");
        render();
    }

    function showConfigScene() {
        byId("scene-lab").classList.add("hidden");
        byId("scene-config").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "instant" });
    }

    function init() {
        configToForm(baseline);
        FIELD_KEYS.forEach(function (k) {
            var e = byId("c-" + k);
            if (e) e.addEventListener("input", validate);
        });
        validate();
        byId("launchBtn").addEventListener("click", showLabScene);
        byId("backBtn").addEventListener("click", showConfigScene);
        document.querySelectorAll(".t").forEach(function (b) {
            b.addEventListener("click", function () {
                document.querySelectorAll(".t").forEach(function (t) { t.classList.remove("on"); });
                b.classList.add("on");
                state.tab = b.getAttribute("data-tab");
                render();
            });
        });
        byId("resetBtn").addEventListener("click", function () { resetSliders(); render(); });
        initSliders();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
