import { cattleVariants } from './CattlePresentation';

/** Presentation sizes only; species ages, production and capacity remain Core-owned. */
const sizes = {
    goat: { baby: .35, female: .65, male: .8 },
    pig: { baby: .28, female: .65, male: .75 },
    sheep: { baby: .38, female: .7, male: .8 },
} as const;

export function livestockAsset(species: string, sex: string, stage: string): string | null {
    if (species === 'cattle') return stage === 'Young' ? 'baby' :
        stage === 'Young Adult' ? 'young-adult' : sex === 'female' ? 'adult-female' : 'adult-male';
    if (!Object.hasOwn(sizes, species)) return null;
    if (species === 'pig' && stage === 'Young') return null;
    return species + '/' + (stage === 'Young' ? 'baby' : sex === 'female' ? 'adult-female' : 'adult-male');
}

export function livestockPresentation(asset?: string) {
    if (!asset) return null;
    if (Object.hasOwn(cattleVariants, asset)) {
        const reference = cattleVariants[asset as keyof typeof cattleVariants];
        return { ...reference, directory: 'game-assets/cattle/' + asset,
            radius: asset === 'baby' ? .5 : asset === 'young-adult' ? .7 : .9 };
    }
    const [species, variant] = asset.split('/');
    if (species === 'pig' && variant === 'baby') return null;
    if (!Object.hasOwn(sizes, species) || !['baby', 'adult-female', 'adult-male'].includes(variant)) return null;
    const profile = sizes[species as keyof typeof sizes];
    const withers = profile[variant === 'baby' ? 'baby' : variant === 'adult-female' ? 'female' : 'male'];
    return { label: species + ' · ' + variant, withers, humanDistance: withers * 1.25 + .4,
        radius: withers * .8, directory: 'game-assets/livestock/' + asset };
}
