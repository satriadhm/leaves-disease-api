// verify-model.js - Run this script to verify your model files
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, 'models/tfjs_model');
const MODEL_JSON = path.join(MODEL_DIR, 'model.json');
const LABELS_PATH = path.join(__dirname, 'models/labels.txt');

console.log('🔍 Verifying model files...\n');

// Check if model directory exists
if (!fs.existsSync(MODEL_DIR)) {
  console.log('❌ Model directory not found:', MODEL_DIR);
  process.exit(1);
}

// Check model.json
if (!fs.existsSync(MODEL_JSON)) {
  console.log('❌ model.json not found');
  process.exit(1);
} else {
  console.log('✅ model.json found');
  
  try {
    const modelData = JSON.parse(fs.readFileSync(MODEL_JSON, 'utf8'));
    console.log('✅ model.json is valid JSON');
    console.log(`   Format: ${modelData.format}`);
    console.log(`   Generated by: ${modelData.generatedBy}`);
    console.log(`   Converted by: ${modelData.convertedBy}`);
    
    // Check weight files
    if (modelData.weightsManifest && modelData.weightsManifest.length > 0) {
      const manifest = modelData.weightsManifest[0];
      console.log(`\n📦 Expected ${manifest.paths.length} weight files:`);
      
      let allFilesExist = true;
      let totalSize = 0;
      
      for (const weightPath of manifest.paths) {
        const weightFilePath = path.join(MODEL_DIR, weightPath);
        if (fs.existsSync(weightFilePath)) {
          const stats = fs.statSync(weightFilePath);
          totalSize += stats.size;
          console.log(`✅ ${weightPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
          console.log(`❌ ${weightPath} - MISSING`);
          allFilesExist = false;
        }
      }
      
      if (allFilesExist) {
        console.log(`\n✅ All weight files found! Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log('\n❌ Some weight files are missing!');
      }
    }
  } catch (error) {
    console.log('❌ model.json is invalid:', error.message);
  }
}

// Check labels.txt
if (!fs.existsSync(LABELS_PATH)) {
  console.log('\n❌ labels.txt not found');
} else {
  console.log('\n✅ labels.txt found');
  try {
    const labelsContent = fs.readFileSync(LABELS_PATH, 'utf8');
    const labels = labelsContent.split('\n').filter(line => line.trim() !== '');
    console.log(`✅ Found ${labels.length} class labels:`);
    labels.forEach((label, index) => {
      if (index < 5) {
        console.log(`   ${index + 1}. ${label}`);
      } else if (index === 5) {
        console.log(`   ... and ${labels.length - 5} more`);
      }
    });
  } catch (error) {
    console.log('❌ Error reading labels.txt:', error.message);
  }
}

console.log('\n🏁 Verification complete!');