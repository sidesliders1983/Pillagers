/** Source-pose calibration reserves production stand-off for runtime equip.
 * This clones metadata; source joints and the registered fit policy stay intact.
 */
export function garmentAuthoringMetadata(metadata){
    if(metadata.type!=='garment'||!metadata.garmentBind)throw new Error('Measured garment bind data is required for canonical authoring.');
    return {...metadata,clearance:0};
}
