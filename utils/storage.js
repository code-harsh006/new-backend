const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class StorageService {
  constructor() {
    this.useS3 = process.env.S3_ENABLED === 'true';
    
    if (this.useS3) {
      this.s3 = new AWS.S3({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      });
      this.bucketName = process.env.S3_BUCKET_NAME;
    }
  }

  async uploadFile(file) {
    const uniqueFilename = `${Date.now()}${path.extname(file.originalname)}`;
    
    if (this.useS3) {
      // Upload to S3
      const params = {
        Bucket: this.bucketName,
        Key: uniqueFilename,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
      };

      const data = await this.s3.upload(params).promise();
      // Remove local file after upload
      fs.unlinkSync(file.path);
      return {
        filePath: data.Key,
        location: data.Location,
      };
    } else {
      // Local filesystem storage
      const uploadDir = process.env.UPLOAD_FOLDER || './uploads';
      const newPath = path.join(uploadDir, uniqueFilename);
      fs.renameSync(file.path, newPath);
      return {
        filePath: uniqueFilename,
        location: `/uploads/${uniqueFilename}`,
      };
    }
  }

  async getFileUrl(filePath) {
    if (this.useS3) {
      return `https://${this.bucketName}.${process.env.S3_ENDPOINT.replace('https://', '')}/${filePath}`;
    }
    return `/uploads/${filePath}`;
  }

  async deleteFile(filePath) {
    if (this.useS3) {
      const params = {
        Bucket: this.bucketName,
        Key: filePath,
      };
      await this.s3.deleteObject(params).promise();
    } else {
      const fileFullPath = path.join(process.env.UPLOAD_FOLDER || './uploads', filePath);
      if (fs.existsSync(fileFullPath)) {
        fs.unlinkSync(fileFullPath);
      }
    }
  }
}

module.exports = new StorageService();