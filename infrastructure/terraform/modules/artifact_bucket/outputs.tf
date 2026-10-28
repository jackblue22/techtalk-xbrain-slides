output "bucket_name" { value = aws_s3_bucket.this.id }
output "object_key" { value = aws_s3_object.artifact.key }
output "object_arn" { value = aws_s3_object.artifact.arn }

