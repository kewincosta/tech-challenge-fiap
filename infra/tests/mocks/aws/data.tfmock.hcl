# What the data sources of the AWS provider answer in a mocked plan. The zones and the account are
# made up: nothing here is read from AWS.

mock_data "aws_availability_zones" {
  defaults = {
    names    = ["us-east-1a", "us-east-1b", "us-east-1c"]
    zone_ids = ["use1-az1", "use1-az2", "use1-az4"]
  }
}

mock_data "aws_caller_identity" {
  defaults = {
    account_id = "123456789012"
    arn        = "arn:aws:iam::123456789012:user/tester"
    user_id    = "AIDAEXAMPLEEXAMPLE"
  }
}

mock_data "aws_partition" {
  defaults = {
    partition          = "aws"
    dns_suffix         = "amazonaws.com"
    reverse_dns_prefix = "com.amazonaws"
  }
}

mock_data "aws_iam_policy_document" {
  defaults = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

mock_data "aws_iam_session_context" {
  defaults = {
    arn         = "arn:aws:iam::123456789012:user/tester"
    issuer_arn  = "arn:aws:iam::123456789012:user/tester"
    issuer_id   = "AIDAEXAMPLEEXAMPLE"
    issuer_name = "tester"
  }
}
