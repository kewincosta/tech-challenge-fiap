output "host" {
  description = "The address the instance answers on."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "The port the instance answers on."
  value       = aws_db_instance.this.port
}

output "name" {
  description = "The database the application connects to."
  value       = aws_db_instance.this.db_name
}

output "user" {
  description = "The master user."
  value       = aws_db_instance.this.username
}

output "password" {
  description = "The generated password of the master user."
  value       = random_password.master.result
  sensitive   = true
}
