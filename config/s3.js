const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!region || !accessKeyId || !secretAccessKey) {
  if (process.env.NODE_ENV !== 'test') { // Don't log in test environment
    console.warn('⚠️ S3 credentials are not fully configured. File uploads will be disabled.');
  }
}

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

module.exports = s3Client; 