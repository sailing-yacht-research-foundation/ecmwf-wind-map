import AWS from 'aws-sdk';
import stream from 'stream';

function uploadStreamToS3(
  bucket: string,
  key: string,
): {
  writeStream: stream.PassThrough;
  uploadPromise: Promise<AWS.S3.ManagedUpload.SendData>;
} {
  const mockPromise = new Promise<AWS.S3.ManagedUpload.SendData>((resolve) => {
    // mock a response from s3 after done uploading
    setTimeout(() => {
      resolve({
        Location: 'https://s3.aws.com/bucketName/path/to/file.txt',
        ETag: 'etag',
        Bucket: 'bucketName',
        Key: 'path/to/file.txt',
      });
    }, 100);
  });
  return { writeStream: new stream.PassThrough(), uploadPromise: mockPromise };
}

export { uploadStreamToS3 };
