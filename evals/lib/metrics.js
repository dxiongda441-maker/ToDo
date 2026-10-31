function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i += 1) {
        result = (result * (n - k + i)) / i;
    }
    return result;
}

// Unbiased estimate of the chance that at least one of k trials passes,
// given c passes out of n trials (Chen et al., 2021).
function passAtK(n, c, k) {
    if (n === 0 || k > n) return null;
    if (n - c < k) return 1;
    return 1 - choose(n - c, k) / choose(n, k);
}

// Estimate of the chance that all k trials pass: consistency, not best case.
function passHatK(n, c, k) {
    if (n === 0 || k > n) return null;
    return choose(c, k) / choose(n, k);
}

function mean(values) {
    const present = values.filter(value => typeof value === "number" && Number.isFinite(value));
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

// 95% Wilson score interval for c passes out of n trials. Trials of one task
// are not independent of each other, so treat it as a lower bound on the noise.
function wilson(n, c, z = 1.96) {
    if (n === 0) return null;
    const p = c / n;
    const denominator = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / denominator;
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

// Two-proportion z statistic for comparing pass rates of two runs.
function zScore(n1, c1, n2, c2) {
    if (!n1 || !n2) return null;
    const pooled = (c1 + c2) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
    return se === 0 ? 0 : (c2 / n2 - c1 / n1) / se;
}

module.exports = { passAtK, passHatK, mean, wilson, zScore };
