# The state of prod, in the bucket the bootstrap creates. The bucket name repeats the one in
# bootstrap/variables.tf, because a backend file cannot take variables.
bucket       = "workshop-tfstate-kewincosta"
key          = "prod/terraform.tfstate"
region       = "us-east-1"
use_lockfile = true
encrypt      = true
