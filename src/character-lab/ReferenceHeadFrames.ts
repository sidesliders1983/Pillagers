/** Measured original bust frames; raw Blender coordinates, before legacy fitting. */
export const referenceHeadFrames = {
  "hair/short": {
    "centre": [
      -0.02815541932565583,
      0.01720726474189635,
      0.17082390066390302
    ],
    "radius": 0.2591093406115932,
    "up": [
      -0.05662883558221744,
      -0.03152466427469221,
      0.9978974749557041
    ],
    "front": [
      -0.0017860927640848442,
      0.9995029742538878,
      0.03147402627993659
    ],
    "sourceSha256": "5d0714aafa514553758217d2412001423c42d3d7d7c82199560b3d99ffda8860",
    "rms": 0.02284336621583572,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "measured neck-to-head axis"
  },
  "hair/medium": {
    "centre": [
      -0.016291642528864028,
      0.022838668014652383,
      0.1711511984760113
    ],
    "radius": 0.2574354888818825,
    "up": [
      -0.026146203628686936,
      -0.12398380816446611,
      0.9919397115494692
    ],
    "front": [
      -0.0032669126046405523,
      0.9922842411895075,
      0.12394075991777997
    ],
    "sourceSha256": "6a11a112f44ced668c8047fa3fd0025b5dd7c17bd255a18198501ba713c0ec98",
    "rms": 0.025287382234138917,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "measured neck-to-head axis"
  },
  "hair/long": {
    "centre": [
      -0.039491580062737515,
      -0.0029855604656107426,
      0.11713811375405427
    ],
    "radius": 0.2936351341235419,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.0,
      1.0,
      -0.0
    ],
    "sourceSha256": "770e782a5daef36a90ef9d904e10bbbef14dac67173ac5e825139b50c9096501",
    "rms": 0.01694666297909539,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "hair/tied": {
    "centre": [
      -0.041196801090267694,
      0.09814630124304592,
      0.15814779341695132
    ],
    "radius": 0.2520302401745737,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.0,
      1.0,
      -0.0
    ],
    "sourceSha256": "431b73378f24067ed11c5c6067d4133d031edb7ad539b9ec359c9c0c0c4256d4",
    "rms": 0.03869199657227534,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "hair/bun": {
    "centre": [
      -0.03764181036191336,
      0.061015325082657834,
      0.11818354012895554
    ],
    "radius": 0.22501446368009934,
    "up": [
      -0.030936212151970365,
      -0.05135690254401844,
      0.998201091633731
    ],
    "front": [
      -0.0015908874255879668,
      0.9986803635603757,
      0.05133225609804144
    ],
    "sourceSha256": "b2e50d54374cc913b6aef79a0446ebf2f337857045ee10e47f4d7a204122d2d7",
    "rms": 0.0215771626624886,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "measured neck-to-head axis"
  },
  "hair/braid": {
    "centre": [
      -0.020764914339377955,
      -0.021667715072332602,
      0.205569337111309
    ],
    "radius": 0.22455287625226844,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.0,
      1.0,
      -0.0
    ],
    "sourceSha256": "53fe572dcce00df5e8f3cfeea3a55aa72140c22ebebf44fb2fd8f52124d4c990",
    "rms": 0.016953547443991048,
    "frontMethod": "source pipeline +Y, projected perpendicular to measured up",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "beard/stubble": {
    "centre": [
      -0.03545390970428604,
      0.023653222743699784,
      0.15654082658200036
    ],
    "radius": 0.27441483580796094,
    "up": [
      -0.1118552034655962,
      -0.015232261206103223,
      0.993607765507204
    ],
    "front": [
      -0.3121332926420213,
      0.9498154436127679,
      -0.020577431791430123
    ],
    "sourceSha256": "12c91a82dee12f706c22104fa9dbd9a1579b3c5a58c1c6a6b52c0d34960e820d",
    "rms": 0.021728821455565827,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "measured neck-to-head axis"
  },
  "beard/short": {
    "centre": [
      -0.05220867449278337,
      0.030547382686063412,
      0.15615379695810103
    ],
    "radius": 0.2799449071930391,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.5685245204195363,
      0.822666317337556,
      0.0
    ],
    "sourceSha256": "07123cce8412822d312a5f3ea98e7fae3353ee27f05d7a7d360c58adfec766c3",
    "rms": 0.01410227011021968,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "beard/medium": {
    "centre": [
      -0.048443718392953465,
      0.04622197363273289,
      0.14482084382422505
    ],
    "radius": 0.28821719039749594,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.5268313194587741,
      0.8499698587816671,
      0.0
    ],
    "sourceSha256": "486ee9a49d721d3f1451e74fe8f157b70b5437aa65a9cbbf84208dd37dae4e94",
    "rms": 0.01777852071487065,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "beard/long": {
    "centre": [
      0.026269600904235597,
      -0.023811118293392233,
      0.19088374039079098
    ],
    "radius": 0.2429522385719495,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.48257912574663164,
      0.8758523776262851,
      0.0
    ],
    "sourceSha256": "fa9a86d233babf278715bfa2f4ecfdbd660945fec00dbe846fc703b6dbba8dc6",
    "rms": 0.011460972565743445,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "beard/split-braid": {
    "centre": [
      -0.0027199008233119034,
      0.006158727347098006,
      0.1803845662149241
    ],
    "radius": 0.25555886721138615,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.3512371847804074,
      0.9362865159915174,
      0.0
    ],
    "sourceSha256": "9536c2535ea91dc4008aed7421e80039604ede6f2c7d0cb9b42b541e7daf77d7",
    "rms": 0.01568945067744052,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  },
  "beard/braid": {
    "centre": [
      0.006711467658303006,
      -0.029386162793995696,
      0.2079211316665956
    ],
    "radius": 0.23809050752187755,
    "up": [
      0.0,
      0.0,
      1.0
    ],
    "front": [
      -0.42637378068011755,
      0.9045470685091755,
      0.0
    ],
    "sourceSha256": "35728514e2a31f8297da9cd6589aa8f08536c8df821d68e824db4c99e6254058",
    "rms": 0.02087199823078251,
    "frontMethod": "reference beard attachment centroid",
    "upMethod": "glTF vertical; neck not sufficiently constrained"
  }
} as const;
