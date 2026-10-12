const smallCardinals = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const smallOrdinals = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
    'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
    'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ordinalTens = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth',
    'seventieth', 'eightieth', 'ninetieth'];
const scales: readonly [number, string][] = [[1e15, 'quadrillion'], [1e12, 'trillion'],
    [1e9, 'billion'], [1e6, 'million'], [1000, 'thousand'], [100, 'hundred']];

function validateCount(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Narrative time requires a nonnegative integer.');
}

/** Spell calendar offsets without presenting a calendar-year number to the narrator. */
export function cardinal(value: number): string {
    validateCount(value);
    if (value < 20) return smallCardinals[value];
    if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? '-' + smallCardinals[value % 10] : '');
    const [scale, name] = scales.find(([size]) => value >= size)!;
    const remainder = value % scale;
    return cardinal(Math.floor(value / scale)) + ' ' + name +
        (remainder ? (remainder < 100 ? ' and ' : ' ') + cardinal(remainder) : '');
}

export function ordinal(value: number): string {
    validateCount(value);
    if (value < 20) return smallOrdinals[value];
    if (value < 100) return value % 10 ? tens[Math.floor(value / 10)] + '-' + smallOrdinals[value % 10] :
        ordinalTens[Math.floor(value / 10)];
    const [scale, name] = scales.find(([size]) => value >= size)!;
    const remainder = value % scale;
    return cardinal(Math.floor(value / scale)) + ' ' + name +
        (remainder ? (remainder < 100 ? ' and ' : ' ') + ordinal(remainder) : 'th');
}
