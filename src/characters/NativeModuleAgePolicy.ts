import type { CharacterAsset } from './CharacterAssets';
import { assetDigest } from './AssetDigest';

export interface ModuleAgeRange { min: number; max: number; }

/** Age support comes from the hash-pinned binding, never from the garment type. */
export function parseNativeModuleAgeRange(value: unknown, asset: CharacterAsset): ModuleAgeRange {
    const binding = value as {id?: string; version?: string; rigSignature?: string;
        supportedAges?: ModuleAgeRange} | null;
    const ages = binding?.supportedAges;
    if (!binding || binding.id !== asset.id || binding.version !== 'pillagers-fit/0.2' ||
        binding.rigSignature !== asset.metadata?.nativeBinding?.rigSignature ||
        !ages || !Number.isFinite(ages.min) || !Number.isFinite(ages.max) ||
        ages.min < 0 || ages.max > 100 || ages.min > ages.max) {
        throw new Error('Invalid native module age declaration: ' + asset.id);
    }
    return {min: ages.min, max: ages.max};
}

export function nativeModuleAgeKey(asset: CharacterAsset) {
    return asset.id + ':' + (asset.metadata?.nativeBinding?.sha256 ?? '');
}

export function moduleAvailableAtAge(
    asset: CharacterAsset, age: number, verifiedRange?: ModuleAgeRange,
) {
    if (!Number.isFinite(age)) return false;
    if (!asset.metadata?.nativeBinding) return true;
    return !!verifiedRange && age >= verifiedRange.min && age <= verifiedRange.max;
}

export async function loadNativeModuleAgeRange(
    asset: CharacterAsset, fetchImpl: typeof fetch = fetch,
): Promise<ModuleAgeRange> {
    const binding = asset.metadata?.nativeBinding;
    if (!binding) throw new Error('Native binding is missing: ' + asset.id);
    const response = await fetchImpl(binding.path + '?v=' + binding.sha256.slice(0, 12));
    if (!response.ok) throw new Error('Could not load module age support: ' + asset.id);
    const bytes = await response.arrayBuffer();
    if (await assetDigest(bytes) !== binding.sha256) {
        throw new Error('Module age support differs from its frozen binding: ' + asset.id);
    }
    return parseNativeModuleAgeRange(JSON.parse(new TextDecoder().decode(bytes)), asset);
}
