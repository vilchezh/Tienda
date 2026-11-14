// Shared by classic browser scripts and the Supabase Edge Functions.
globalThis.StorePricing = Object.freeze({
  breakdown(basePrice, woodAmount = 0, extrasAmount = 0, commissionPercent = 0) {
    const amounts = [basePrice, woodAmount, extrasAmount].map(Number);
    const percent = Number(commissionPercent);
    if (amounts.some(value => !Number.isSafeInteger(value) || value < 0) ||
        !Number.isFinite(percent) || percent < 0 || percent > 50 ||
        Math.abs(Math.round(percent * 100) - percent * 100) > 1e-7) {
      throw new RangeError('Importe o comisión inválidos.');
    }
    const subtotal = amounts.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(subtotal)) throw new RangeError('Subtotal inválido.');
    const withCommission = Math.ceil(subtotal * (10000 + Math.round(percent * 100)) / 10000);
    const total = Math.ceil(withCommission / 1000) * 1000;
    if (!Number.isSafeInteger(total)) throw new RangeError('Total inválido.');
    return Object.freeze({
      base: amounts[0], wood: amounts[1], extras: amounts[2], subtotal,
      commission: withCommission - subtotal, rounding: total - withCommission, total,
    });
  },
});
