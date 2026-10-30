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

module.exports = { passAtK, passHatK, mean };
