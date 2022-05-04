import AWS from 'aws-sdk';
import stream from 'stream';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

export default function uploadStreamToS3(
  bucket: string,
  key: string,
): {
  writeStream: stream.PassThrough;
  uploadPromise: Promise<AWS.S3.ManagedUpload.SendData>;
} {
  const passThrough = new stream.PassThrough();

  const uploadPromise = s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: passThrough,
    })
    .promise();

  return { writeStream: passThrough, uploadPromise };
}
