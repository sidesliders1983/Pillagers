# Release projection regression

The first full CI run for PR #242 at `88497a2` reported 1,107 passing tests,
one failure and ten skipped tests. The failure was the existing public rival
projection contract: facial ancestry metadata introduced a `parentIds` field
into anonymous observed residents. This was a release regression, not an
inherited baseline failure. The Site was not updated from that revision.

The unchanged privacy assertion reproduced the failure locally. The test was
then strengthened to require only versioned shape axes, while retaining the
actual observed face. Render projections and the native factory now accept a
validated `FacialShapeV1` without family metadata. The full inherited profile
remains available to the resident appearance and Lab snapshot contracts; Core,
DNA, ancestry and saved campaigns are unchanged. The native factory test also
uses the same metadata-free shape accepted from observed rivals.

The eight focused facial, portrait, hair, wardrobe and rival suites passed all
40 tests with no failures or skips after the fix. Public validation passed all
505 files. Formatting was reviewed manually and `git diff --check` passed.
Full CI must pass for the new revision before merging or publication.

```powershell
node --test tests/island-clans.test.mjs tests/native-facial-geometry.test.mjs tests/facial-identity.test.mjs tests/lab-facial-snapshot.test.mjs tests/character-portraits.test.mjs tests/resident-appearance.test.mjs tests/female-hair.test.mjs tests/fjord-clothing.test.mjs
```
