param([Parameter(Mandatory)][string]$Profile)
$region='ap-southeast-1';$zone='ap-southeast-1-han-1a'
$oldPreference=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue'
$identityOutput=@(& aws sts get-caller-identity --profile $Profile --output json 2>&1);$identityExit=$LASTEXITCODE
$ErrorActionPreference=$oldPreference
if($identityExit -ne 0){
  [ordered]@{profile=$Profile;authentication='BLOCKED_BY_AUTH';zoneStatus='NOT_CHECKED';message='STS failed. Authenticate the selected profile; do not infer account ineligibility.'}|ConvertTo-Json
  exit 2
}
[ordered]@{profile=$Profile;authentication='AUTHENTICATED';identity='REDACTED_FROM_OUTPUT'}|ConvertTo-Json
$zones=& aws ec2 describe-availability-zones --region $region --all-availability-zones --filters "Name=zone-name,Values=$zone" --profile $Profile --output json
if($LASTEXITCODE -ne 0){throw 'Read-only availability-zone query failed.'}
$zoneResult=($zones|ConvertFrom-Json).AvailabilityZones|Select-Object -First 1
if($null -eq $zoneResult){[ordered]@{zone=$zone;visibility='NOT_RETURNED';optInStatus='UNKNOWN'}|ConvertTo-Json}else{[ordered]@{zone=$zone;visibility='VISIBLE';zoneType=$zoneResult.ZoneType;optInStatus=$zoneResult.OptInStatus;parentZone=$zoneResult.ParentZoneName}|ConvertTo-Json}
$offerings=& aws ec2 describe-instance-type-offerings --region $region --location-type availability-zone --filters "Name=location,Values=$zone" --profile $Profile --output json
if($LASTEXITCODE -ne 0){throw 'Read-only instance-offering query failed.'}
$types=@(($offerings|ConvertFrom-Json).InstanceTypeOfferings.InstanceType | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
[ordered]@{zone=$zone;offeringCount=$types.Count;interpretation=if($zoneResult.OptInStatus -eq 'not-opted-in'){'Do not infer account ineligibility while zone is not opted in.'}else{'Runtime inventory only; no resources were created.'}}|ConvertTo-Json
