output "sg_alb_id" { value = aws_security_group.sg_alb.id }
output "han_alb_id" { value = aws_security_group.han_alb.id }
output "sg_app_id" { value = aws_security_group.sg_app.id }
output "han_app_id" { value = aws_security_group.han_app.id }
output "rds_id" { value = aws_security_group.rds.id }
output "han_db_id" { value = aws_security_group.han_db.id }
output "endpoints_id" { value = aws_security_group.endpoints.id }

