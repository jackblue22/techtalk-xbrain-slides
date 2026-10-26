import ec2 from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Compute/64/Arch_Amazon-EC2_64.svg";
import lambda from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Compute/64/Arch_AWS-Lambda_64.svg";
import ecs from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg";
import eks from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Containers/64/Arch_Amazon-Elastic-Kubernetes-Service_64.svg";
import rds from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Databases/64/Arch_Amazon-RDS_64.svg";
import mgn from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Migration-Modernization/64/Arch_AWS-Application-Migration-Service_64.svg";
import cloudWatch from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Management-Tools/64/Arch_Amazon-CloudWatch_64.svg";
import cloudFormation from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Management-Tools/64/Arch_AWS-CloudFormation_64.svg";
import vpc from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg";
import directConnect from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Networking-Content-Delivery/64/Arch_AWS-Direct-Connect_64.svg";
import loadBalancer from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg";
import route53 from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Networking-Content-Delivery/64/Arch_Amazon-Route-53_64.svg";
import vpn from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Networking-Content-Delivery/64/Arch_AWS-Site-to-Site-VPN_64.svg";
import ebs from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Storage/64/Arch_Amazon-Elastic-Block-Store_64.svg";
import s3 from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg";
import drs from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Storage/64/Arch_AWS-Elastic-Disaster-Recovery_64.svg";
import bedrock from "../../icon-package-aws/Architecture-Service-Icons_07312026/Arch_Artificial-Intelligence/64/Arch_Amazon-Bedrock_64.svg";

export const awsIcons = {
  bedrock,
  cloudFormation,
  cloudWatch,
  directConnect,
  drs,
  ebs,
  ec2,
  ecs,
  eks,
  lambda,
  loadBalancer,
  mgn,
  rds,
  route53,
  s3,
  vpc,
  vpn,
} as const;

export type AwsIconName = keyof typeof awsIcons;
