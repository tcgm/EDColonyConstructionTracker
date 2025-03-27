const { build } = require('electron-builder');
const { execSync } = require('child_process');
const path = require('path');

async function runBuild() {
  const configs = [
    {
      name: 'NSIS (installer with directory selection)',
      configPath: './electron-builder.nsis.json',
    },
    {
      name: 'OneClick NSIS (auto-install)',
      configPath: './electron-builder.oneclick.json',
    },
    {
      name: 'Portable (no installer)',
      configPath: './electron-builder.portable.json',
    },
  ];

  try {
    console.log('\n🛠️  Step 1: Building renderer & main via Webpack...\n');
    execSync('npm run build', { stdio: 'inherit' });

    for (const cfg of configs) {
      console.log(`\n🚀 Building: ${cfg.name}`);
      await build({ config: cfg.configPath });
      console.log(`✅ Done: ${cfg.name}`);
    }

    console.log('\n🎉 All builds completed successfully!\n');
  } catch (err) {
    console.error('\n❌ Build failed:', err);
    process.exit(1);
  }
}

runBuild();
