// Release builds are signed with a private key that never enters the repo.
// The keystore path and passwords come from ~/.gradle/gradle.properties:
//   AURA_RELEASE_STORE_FILE, AURA_RELEASE_STORE_PASSWORD, AURA_RELEASE_KEY_ALIAS, AURA_RELEASE_KEY_PASSWORD
// Without them a release build fails ("missing storeFile") instead of silently using the public debug key.
// Debug builds are untouched. Runs on every prebuild, so it survives `expo prebuild --clean`.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `        release {
            if (project.hasProperty('AURA_RELEASE_STORE_FILE')) {
                storeFile file(AURA_RELEASE_STORE_FILE)
                storePassword AURA_RELEASE_STORE_PASSWORD
                keyAlias AURA_RELEASE_KEY_ALIAS
                keyPassword AURA_RELEASE_KEY_PASSWORD
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes('AURA_RELEASE_STORE_FILE')) return c;
    if (!/signingConfigs \{\n/.test(g)) throw new Error('withReleaseSigning: signingConfigs block not found');
    g = g.replace(/signingConfigs \{\n/, (m) => m + RELEASE_CONFIG);
    // The release buildType's line is the last "signingConfig signingConfigs.debug" in the template.
    const needle = 'signingConfig signingConfigs.debug';
    const at = g.lastIndexOf(needle);
    if (at < 0 || g.indexOf(needle) === at) throw new Error('withReleaseSigning: release signingConfig line not found');
    g = g.slice(0, at) + 'signingConfig signingConfigs.release' + g.slice(at + needle.length);
    c.modResults.contents = g;
    return c;
  });
};
