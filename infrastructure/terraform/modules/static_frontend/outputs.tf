output "bucket_name" { value = aws_s3_bucket.this.id }
output "bucket_arn" { value = aws_s3_bucket.this.arn }
output "website_endpoint" { value = aws_s3_bucket_website_configuration.this.website_endpoint }
output "frontend_origin" { value = var.enable_cloudfront ? "https://${aws_cloudfront_distribution.this[0].domain_name}" : "http://${aws_s3_bucket_website_configuration.this.website_endpoint}" }
output "delivery_mode" { value = var.enable_cloudfront ? "CloudFront HTTPS with private S3 origin" : "Direct public S3 website over HTTP" }
