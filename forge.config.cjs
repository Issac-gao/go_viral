module.exports = {
  packagerConfig: {
    name: 'PainPig',
    executableName: 'PainPig',
    appBundleId: 'com.issacgao.painpig',
    appCategoryType: 'public.app-category.entertainment',
    icon: 'build/icon',
    asar: true,
    // Include only runtime code and bundled assets, never local settings or credentials.
    ignore: [/^\/(?!dist(?:\/|$)|build(?:\/|$)|package\.json$|node_modules(?:\/|$))/],
    ...(process.platform === 'darwin' ? { osxSign: { identity: '-', optionsForFile: () => ({ hardenedRuntime: false }) } } : {})
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'PainPig', authors: 'Issac-gao', description: 'A little pig takes your shift', setupIcon: 'build/icon.ico' } },
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'], config: { name: 'PainPig', format: 'ULFO', icon: 'build/icon.icns' } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] }
  ]
};
