resource "aws_cloudwatch_log_group" "ecmwf_wind_map_group" {
  name = "ECMWFWindMap-log"

  retention_in_days = 7

  lifecycle {
    create_before_destroy = true
    prevent_destroy       = false
  }
}

resource "aws_ecs_task_definition" "ecmwf_wind_map_task" {
  family                   = "ecmwf-wind-task"
  container_definitions    = <<DEFINITION
  [
    {
      "name": "${var.wind_task_name}",
      "image": "${aws_ecr_repository.ecmwf_wind_map_ecr.repository_url}",
      "command": ["node", "build/processECMWFWind.js"],
      "essential": true,
      "environmentFiles": [
               {
                   "value": "arn:aws:s3:::syrf-dev-env-variables/ecmwf-wind-map.env",
                   "type": "s3"
               }
           ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${aws_cloudwatch_log_group.ecmwf_wind_map_group.id}",
          "awslogs-region": "${var.aws_region}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "memory": 2048,
      "cpu": 1024
    }
  ]
  DEFINITION
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  memory                   = 2048
  cpu                      = 1024
  execution_role_arn       = var.iam_ecsTaskExecution_role
}

resource "aws_cloudwatch_event_rule" "ecmwf_wind_map_rule" {
  name                = "ecmwf-wind-map-daily"
  description         = "Runs the ECMWF Wind Map download and tiling at 07:30 & 19:30 UTC"
  schedule_expression = "cron(30 7,19 * * ? *)"
  is_enabled          = true
}

resource "aws_cloudwatch_event_target" "ecmwf_wind_map_scheduled_task" {
  rule      = aws_cloudwatch_event_rule.ecmwf_wind_map_rule.name
  target_id = var.wind_task_name
  arn       = var.scraper_runner_arn
  role_arn  = aws_iam_role.ecmwf_wind_map_role.arn

  ecs_target {
    launch_type         = "FARGATE"
    platform_version    = "LATEST"
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.ecmwf_wind_map_task.arn

    network_configuration {
      subnets = ["subnet-0a7debe784cdde60f"]
    }
  }

}

resource "aws_iam_role" "ecmwf_wind_map_role" {
  name = "ecmwf_wind_map_iam"

  assume_role_policy = <<DOC
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "events.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
DOC
}

resource "aws_iam_role_policy" "ecmwf_wind_map_role_policy" {
  name = "ecmwf_wind_map_role_policy"
  role = aws_iam_role.ecmwf_wind_map_role.id

  policy = <<DOC
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "ecs:RunTask",
            "Resource": "${replace(aws_ecs_task_definition.ecmwf_wind_map_task.arn, "/:\\d+$/", ":*")}"
        }
    ]
}
DOC
}