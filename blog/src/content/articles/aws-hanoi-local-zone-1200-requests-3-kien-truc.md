---
title: "AWS Hanoi Local Zone: 1.200 Requests, 3 Kiến Trúc và Những Trade-offs Khi Thiết Kế Ứng Dụng Thực Tế"
description: "Một benchmark lịch sử từ Việt Nam cho thấy lợi ích của locality, cái giá của SQL tuần tự xuyên địa điểm, và cách cân bằng Hanoi Local Zone với managed services tại Singapore."
publishedAt: 2026-11-13
eyebrow: "Phân tích kiến trúc · Singapore / Hanoi / Hybrid"
readingTime: "18 phút đọc"
tags:
  - AWS Local Zones
  - PostgreSQL
  - Kiến trúc cloud
  - Hiệu năng
featured: true
lang: vi
translationSlug: what-1200-requests-taught-us
---

Một database được chuyển đến gần người dùng Việt Nam hơn. Ứng dụng lại chậm đi rất nhiều.

Điều đó chỉ có vẻ mâu thuẫn nếu ta coi “gần” là thuộc tính của một resource. Trên thực tế, latency mà người dùng cảm nhận thuộc về cả đường đi: browser đến API, API đến database, từng lượt chờ đồng bộ, và phần xử lý nằm giữa chúng.

Để quan sát tác động đó, mình xây dựng một learning lab so sánh ba đường đi thực tế:

1. **Singapore:** Vietnam client → Singapore API → Singapore PostgreSQL.
2. **Hanoi:** Vietnam client → Hanoi API → Hanoi PostgreSQL.
3. **Hybrid:** Vietnam client → Singapore API → private Hanoi PostgreSQL.

Lần benchmark AWS_REAL lịch sử ngày 29/10/2026 hoàn thành **1.200 measured HTTP requests** và không ghi nhận HTTP error. Ở workload 20 SQL queries tuần tự, Hybrid có HTTP p50 khoảng **773 ms**, trong khi Singapore khoảng **62 ms** và Hanoi khoảng **44 ms**.

Nhưng đây không chỉ là câu chuyện về latency. Khi chuyển một lab thành ứng dụng 3-tier thực tế, ta còn phải trả lời: RDS ở đâu, backup đi đâu, control plane nằm ở đâu, high availability được thiết kế thế nào, và ai chịu trách nhiệm vận hành database?

> Local Zone là một công cụ kiến trúc. Nó không phải một Region thu nhỏ có đủ mọi dịch vụ.

## Hanoi Local Zone có những gì — và giới hạn nằm ở đâu?

Hanoi Local Zone (`ap-southeast-1-han-1a`) là phần mở rộng của Singapore Region (`ap-southeast-1`). Theo [ma trận dịch vụ AWS Local Zones](https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/) được kiểm tra ngày 13/11/2026, các capability đáng chú ý tại Hanoi gồm:

| Thành phần | Trạng thái tại Hanoi Local Zone |
|---|---|
| Amazon EC2 | C7i, M7i, R7i |
| Amazon EBS | gp2, gp3, io1 và EBS Local Snapshots |
| Amazon VPC | Có |
| Application Load Balancer | Có |
| Amazon ECS | Có; workload chạy trên EC2 capacity tại Local Zone |
| Amazon EKS | Có; data plane có thể dùng EC2 nodes tại Local Zone |
| Amazon S3 | S3 One Zone-IA |
| Amazon EMR | Có |
| Amazon RDS | Không được liệt kê hỗ trợ trực tiếp |
| Amazon ElastiCache | Không được liệt kê hỗ trợ trực tiếp |
| NAT Gateway | Không được liệt kê hỗ trợ trực tiếp |

Ma trận này là dữ liệu theo thời điểm; trước một thiết kế hoặc deployment mới, cần kiểm tra lại nguồn chính thức.

“EKS được hỗ trợ” cũng không có nghĩa toàn bộ EKS nằm ở Hà Nội. [Tài liệu EKS Local Zones](https://docs.aws.amazon.com/eks/latest/userguide/local-zones.html) nêu rõ managed control plane vẫn chạy trong parent Region; EC2 worker nodes mới được đặt trong Local Zone. Fargate Pods không triển khai được vào Local Zones, vì vậy EKS workload ở đây cần managed node groups hoặc self-managed EC2 nodes.

Với ECS, thiết kế tham khảo trong bài dùng **EC2 capacity** tại Hanoi. Không nên suy luận khả năng placement của Fargate trong Local Zone chỉ từ việc Fargate được hỗ trợ ở Singapore Region.

Do đó, bài toán không phải là “copy nguyên hệ thống Singapore sang Hanoi”. Ta cần chọn tier nào thực sự cần local, tier nào nên dùng Regional managed service, và cách các tier giao tiếp với nhau.

## Benchmark: vị trí API và database thay đổi điều gì?

Backend của lab là một mini-order application dùng Fastify và PostgreSQL. Để giữ chi phí thấp, ba scenario logic chỉ dùng hai EC2 instances:

- Singapore EC2 chạy Singapore API, Hybrid API và Singapore PostgreSQL.
- Hanoi EC2 chạy Hanoi API và Hanoi PostgreSQL.

Static React frontend được phục vụ từ S3 ở Singapore Region theo một delivery path riêng. S3 **không** nằm giữa API và database.

Benchmark endpoint thực hiện 1, 5, 10 hoặc 20 parameterized PostgreSQL queries **tuần tự** trong mỗi HTTP request. Mỗi nhóm loại 5 warm-up requests rồi lưu 100 measured requests tại concurrency 1. Tổng cộng có 12 nhóm và 1.200 samples.

### HTTP latency p50 (ms)

| Scenario | 1 query | 5 queries | 10 queries | 20 queries |
|---|---:|---:|---:|---:|
| Singapore | 56,7 | 57,6 | 59,5 | 62,0 |
| Hanoi | 41,9 | 42,1 | 42,4 | 43,9 |
| Hybrid | 88,3 | 232,3 | 415,6 | 773,5 |

Trong lần đo này, từ client path này, Hanoi có HTTP p50 thấp hơn Singapore. Đây là một quan sát có bằng chứng — không phải cam kết rằng Hanoi luôn nhanh hơn. ISP routing, client location, TLS, load, thời điểm đo và loại máy đều có thể thay đổi kết quả.

### DB latency p50 (ms)

| Scenario | 1 query | 5 queries | 10 queries | 20 queries |
|---|---:|---:|---:|---:|
| Singapore | 0,988 | 2,578 | 3,825 | 6,728 |
| Hanoi | 0,478 | 1,263 | 1,368 | 2,325 |
| Hybrid | 36,365 | 180,164 | 359,563 | 719,100 |

Hybrid là kết quả đáng chú ý nhất. Khi API ở Singapore và PostgreSQL ở Hanoi, mỗi query tuần tự phải chờ qua đường kết nối giữa hai địa điểm. Một query mất khoảng 36 ms ở p50; 20 queries cộng dồn thành khoảng 719 ms.

Một mô hình tư duy hữu ích là:

> Total response time ≈ client-to-API + application work + N × cross-location database wait + variance và protocol overhead.

Đây không phải công thức được fit từ packet-level RTT, và lab không bịa ra timing của từng network hop. Biến thiên giữa các HTTP samples là **HTTP latency variation**, không phải phép đo network jitter.

Benchmark cũng không phải thí nghiệm chỉ thay đổi địa lý: hai EC2 dùng instance type khác nhau, concurrency bằng 1, và chỉ một client network path được đo. Đặc biệt, Hybrid đo **Singapore API → Hanoi PostgreSQL**; nó không đo tuyến ngược **Hanoi API → Singapore RDS**. Các architecture proposals ở phần sau vì thế cần benchmark riêng.

## Trade-off 1 — Data-path locality hay managed database?

Đặt API và PostgreSQL cùng tại Hanoi loại bỏ các lượt SQL đồng bộ xuyên địa điểm trên đường đi chính. Nhưng vì RDS không được liệt kê tại Hanoi Local Zone, giữ PostgreSQL local đồng nghĩa vận hành nó trên EC2.

Team khi đó phải chịu trách nhiệm cho:

- Cài đặt, cấu hình và nâng cấp PostgreSQL.
- Security patching và hardening.
- Backup schedule, kiểm tra backup và restore drill.
- Monitoring, capacity management và connection behavior.
- Replication, failover và recovery procedure.

RDS ở Singapore có thể giảm đáng kể phần vận hành. Đổi lại, nếu API tại Hanoi liên tục gọi RDS tại Singapore, database path có thể trở thành bottleneck mới.

Đây là lựa chọn giữa **data-path locality** và **operational convenience**, không có đáp án mặc định đúng cho mọi workload.

## Trade-off 2 — Local compute không tự tạo high availability

Hanoi hiện được công bố với một Local Zone identifier. Chạy hai API instances trong cùng Local Zone có thể giúp chịu lỗi ở cấp instance, nhưng không tạo khả năng chịu lỗi giữa nhiều địa điểm độc lập.

Singapore Region cung cấp nhiều lựa chọn Multi-AZ hơn cho các managed services phù hợp. Nếu workload cần high availability, kiến trúc phải xác định regional fallback, database replication, traffic failover, dependency on parent-Region control planes, cùng RTO và RPO.

Nói “có backup” không đủ. Cần biết backup ở đâu, restore mất bao lâu, mất tối đa bao nhiêu dữ liệu, và điều gì xảy ra nếu Local Zone hoặc đường kết nối đến parent Region gián đoạn.

## Trade-off 3 — Infrastructure cost chỉ là một phần của bài toán

Chi phí Local Zone không chỉ gồm một EC2 và một EBS volume. Một 3-tier production design có thể thêm ALB, nhiều instances, backup storage, monitoring, replication, public IPv4 và data transfer.

Self-managed services còn tạo engineering cost và on-call cost. Ngược lại, dùng RDS tại Singapore có managed-service cost, data transfer và latency của những lời gọi xuyên địa điểm.

So sánh đúng cần nhìn tổng thể:

**Infrastructure + Data Transfer + Operations + Availability Requirements**

Chi phí lịch sử của lab không nên được tái sử dụng như báo giá hiện tại. Giá dịch vụ và pattern sử dụng cần được tính lại tại thời điểm thiết kế.

## Trade-off 4 — Placement không phải chứng chỉ data residency

Hanoi hỗ trợ EBS Local Snapshots và S3 One Zone-IA. Tuy nhiên, đặt EC2 và encrypted EBS tại `ap-southeast-1-han-1a` không chứng minh mọi byte của hệ thống luôn ở Việt Nam.

[Tài liệu EBS Local Snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html) nêu rõ snapshot của EBS volume trong Local Zone mặc định được lưu tại parent Region; nếu Local Zone hỗ trợ S3, operator có thể chọn Local Snapshot và dùng IAM policy để enforce residency. Sau khi chọn chuỗi local snapshots, các snapshot kế tiếp của volume đó cũng phải tiếp tục local.

Các thành phần khác — Secrets Manager, Regional S3, logs, container images, KMS, support workflow, backup copy và control-plane metadata — phải được audit riêng. Residency là thuộc tính của **toàn bộ data lifecycle**, không phải nhãn địa lý của một instance.

## Ba reference architectures cho ứng dụng 3-tier

Giả sử ứng dụng gồm React frontend, Fastify API và PostgreSQL. Presentation tier, application tier và data tier có thể kết hợp với Hanoi Local Zone theo ít nhất ba hướng.

Ba thiết kế dưới đây là **reference designs chưa được xác minh bằng benchmark 1.200 requests**. Chúng là giả thuyết kiến trúc để tiếp tục đo, không phải kết luận production-ready.

### Architecture A — Local-first

**Mục tiêu:** giữ API và primary database tại Hanoi để tối ưu synchronous path.

Luồng frontend:

`Vietnam browser → CloudFront → S3 static assets (Singapore)`

Luồng API:

`Vietnam browser → Hanoi ALB → Fastify trên ECS/EC2 (Hanoi) → PostgreSQL trên EC2 + EBS (Hanoi)`

Các supporting services như ECR, IAM, Secrets Manager, CloudWatch và Systems Manager có thể vẫn thuộc parent Region, tùy yêu cầu và support matrix.

**Presentation tier.** React được build thành static files trong S3 general-purpose bucket tại Singapore, rồi phân phối bằng CloudFront và HTTPS. API dùng hostname riêng trỏ đến Hanoi ALB. Request API không đi qua S3 bucket.

**Application tier.** VPC mở rộng từ Singapore Region đến subnet tại Hanoi. Internet-facing ALB nhận HTTPS và route đến backend. Fastify có thể chạy trực tiếp trên EC2 hoặc dưới dạng ECS service với EC2 launch type. ECS giúp orchestration, nhưng team vẫn quản lý EC2 capacity, AMI, patching và placement.

**Data tier.** PostgreSQL chạy trên EC2 riêng với encrypted gp3 EBS. Database không có public endpoint; Security Group chỉ cho phép application tier truy cập cổng cần thiết. Backup location, restore test, monitoring và recovery drill là phần bắt buộc của thiết kế.

Ưu điểm là API và primary database colocated. Nhược điểm là team tự chịu trách nhiệm cho database availability và operations. Nhiều API instances trong cùng Local Zone vẫn không tương đương Multi-AZ.

### Architecture B — Managed-first hybrid

**Mục tiêu:** đưa application tier gần client, giữ database trên managed service.

Luồng frontend:

`Vietnam browser → CloudFront → S3 (Singapore)`

Luồng API:

`Vietnam browser → Hanoi ALB → ECS trên EC2 (Hanoi) → RDS PostgreSQL (Singapore)`

RDS cung cấp managed backup, patching và các availability options của parent Region. Đây có thể là lựa chọn hợp lý cho team không muốn tự vận hành PostgreSQL.

Nhưng nếu mỗi request phát sinh nhiều SQL queries tuần tự về Singapore, lợi ích đặt API tại Hanoi có thể bị xóa. Architecture B cần benchmark riêng với workload thật. Các hướng cần thử gồm query batching, giảm N+1, connection pooling, local cache có kiểm soát, bounded concurrency khi đảm bảo correctness, và đưa công việc không cần phản hồi ngay sang asynchronous processing.

### Architecture C — Selective locality / Regional core

**Mục tiêu:** chỉ đưa workload nhạy latency tới Hanoi; giữ system of record và phần lớn managed services ở Singapore.

Một đường đọc tham khảo:

`Vietnam browser → Hanoi read service → local cache/read model`

Business services quản lý transaction và primary RDS vẫn chạy tại Singapore. Những feature read-heavy như catalog hoặc personalization có thể dùng dữ liệu cache hoặc read model được đồng bộ phù hợp tại Hanoi. Write cần strong consistency tiếp tục đi tới regional system of record.

Thiết kế này mở thêm những bài toán khó: cache invalidation, eventual consistency, duplicate processing, retry, data ownership và business semantics của trạng thái pending/success/failed. Một order không thể được coi là thanh toán thành công chỉ vì message đã vào queue.

Selective locality có thể hiệu quả, nhưng nó đổi network latency lấy application complexity. Trade-off đó phải được đo và được team chấp nhận rõ ràng.

## Khi managed service không có tại Hanoi

Có ba chiến lược cơ bản:

1. **Self-host locally:** chạy phần mềm tương đương trên EC2 tại Hanoi.
2. **Use regionally:** giữ managed service tại Singapore và kết nối qua network phù hợp.
3. **Redesign the flow:** giảm synchronous remote calls bằng batch, cache hoặc async boundary.

| Nhu cầu | Phương án | Trade-off chính |
|---|---|---|
| RDS/Aurora PostgreSQL | PostgreSQL trên EC2 + EBS ở Hanoi, hoặc RDS Singapore | Self-managed DB vs. cross-location latency |
| ElastiCache | Redis/Valkey trên EC2 Hanoi, hoặc ElastiCache Singapore | Local operations vs. remote access |
| ECS workload | ECS với EC2 capacity tại Hanoi | Phải quản lý compute capacity |
| EKS workload | EKS với EC2 nodes tại Hanoi | Regional control plane, node operations; không có Fargate Pods tại LZ |
| API entry point | Hanoi ALB + application middleware | Tự thiết kế một số API management capability |
| Object storage | Regional S3, hoặc Local Zone directory bucket cho use case phù hợp | Feature set, storage semantics và residency khác nhau |
| Queue/workflow | Regional SQS, EventBridge hoặc Step Functions + local workers | Regional dependency và delivery semantics |

Các phương án không tương đương một-một. Redis trên EC2 không tự có failover và management giống ElastiCache; PostgreSQL trên EC2 không tự có lifecycle giống RDS.

Ma trận Hanoi liệt kê S3 One Zone-IA, còn [tài liệu S3 directory bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-bucket-use-cases.html) mô tả use case lưu dữ liệu trong Local Zone. Nhưng directory bucket không phải drop-in replacement cho regional general-purpose bucket: [static website hosting không được hỗ trợ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-differences.html), cùng nhiều khác biệt về versioning, replication và API behavior.

Quyết định phải được đưa ra ở cấp workload, không phải chỉ thay service theo tên.

## Blueprint cho một lab 3-tier mở rộng

Nếu mở rộng repository hiện tại, Architecture A là điểm bắt đầu trực quan vì API và database cùng local. Một rehearsal có kiểm soát nên đi qua sáu phase.

### Phase 1 — Network và infrastructure

Enable Hanoi Local Zone, tạo VPC với subnet tại Singapore và Hanoi, rồi thiết kế Security Groups theo least privilege: ALB nhận đúng traffic cần thiết, backend chỉ nhận từ ALB, PostgreSQL chỉ nhận từ backend.

Kiểm tra routing, network border group của public IPv4 và outbound access tới supporting services. Không mở `0.0.0.0/0` chỉ để demo chạy.

### Phase 2 — Presentation tier

Build React frontend, publish vào Regional S3 và cấu hình CloudFront. Tách rõ static asset endpoint với API hostname.

### Phase 3 — Application tier

Provision Hanoi ALB, target group và health checks. Chạy Fastify container trên ECS EC2 capacity hoặc trực tiếp trên EC2 nếu ưu tiên lab đơn giản. Cấu hình image deployment, logs, environment variables và secret retrieval theo cơ chế có kiểm soát.

### Phase 4 — Data tier

Provision PostgreSQL EC2 với encrypted EBS trong private subnet. Thiết lập authentication, backup, restore validation và monitoring. Không expose PostgreSQL lên public internet.

### Phase 5 — Benchmark và verification

Kiểm tra health, mini-order read/write behavior, SQL query counts và timing từ client tại Việt Nam. So sánh cùng workload và methodology. Thu thập HTTP p50/p95/p99, application duration, DB duration, error rate, connection behavior và resource utilization.

### Phase 6 — Failure và recovery

Thử API instance failure, database restart, backup restore và mất kết nối tới Regional dependencies. Ghi rõ RTO, RPO, dependency nào còn hoạt động và feature nào bị gián đoạn.

Đây là phần phân biệt “demo chạy được” với một kiến trúc đã được đánh giá về vận hành.

## Ma trận quyết định

| Tiêu chí | A: Local-first | B: Managed-first | C: Selective locality |
|---|---|---|---|
| API–primary DB locality | Tốt | Không colocated | Phụ thuộc request flow |
| Managed DB operations | Thấp | Cao | Cao nếu dùng Regional RDS |
| Operational complexity | Cao | Trung bình | Cao về application design |
| Local read performance | Có tiềm năng; cần đo | Cần đo | Có tiềm năng với cache |
| Strong consistency | Dễ hơn khi DB local | Regional DB thêm latency | Phải định nghĩa read/write semantics |
| Availability strategy | Tự thiết kế | Tận dụng Regional capability | Phức tạp vì phân tán |
| Data residency | Có thể hỗ trợ; vẫn phải audit | Business data ở Singapore RDS | Phụ thuộc data classification và flow |

Đây là so sánh định tính, không phải kết quả benchmark của cả ba proposals. Team nhỏ có thể ưu tiên Managed-first để giảm gánh nặng database. Workload đặc biệt nhạy latency có thể đánh giá Local-first. Hệ thống lớn có thể dùng Selective locality để đưa đúng capability cần thiết về Hanoi.

## Những bài học vận hành từ chính lab

Benchmark chỉ là một nửa câu chuyện. Deployment và cleanup để lại nhiều bài học thực tế hơn một architecture diagram.

**Terraform validate không biết mọi constraint của provider.** Pinned ECS-optimized Amazon Linux 2023 AMI có source snapshot 30 GiB. Cấu hình root 12 GiB qua validation nhưng EC2 không thể tạo volume nhỏ hơn snapshot nguồn. Hai encrypted root volumes phải dùng 30 GiB.

**Local Zone identifier không phải S3 Region endpoint.** Bootstrap Hanoi từng suy ra sai S3 hostname từ zone-like identifier. Artifact thực tế nằm trong parent Region, nên logic được sửa để dùng explicit Singapore Regional endpoint, kiểm tra SHA-256 và retry có giới hạn.

**Secret initialization order ảnh hưởng Hybrid startup.** Hanoi PostgreSQL phải khởi tạo secret trước khi Singapore Hybrid API kết nối. Bootstrap dependency được làm rõ thay vì dựa vào timing may rủi.

**Presenter network là infrastructure input.** Cloudflare WARP từng làm exact `/32` egress thay đổi, khiến reviewed plan không còn hợp lệ. Workflow dừng lại thay vì nới ingress sang Cloudflare range hoặc `0.0.0.0/0`.

**Cleanup cũng cần kiến trúc.** Protected EBS volumes và versioned S3 khiến teardown phải có quyết định retention rõ ràng. Residual audit cuối cùng kiểm tra AWS APIs độc lập, không chỉ dựa vào Terraform state.

Tại checkpoint hiện tại, AWS_REAL là **NOT_DEPLOYED**. Project EC2, EBS, Elastic IP, S3, networking, IAM, snapshots và active secrets đã được audit về zero; estimated active infrastructure cost là **USD 0/hour**. Historical benchmark vẫn được lưu riêng và không được dùng để đánh dấu môi trường là live.

## Kết luận — locality là quyết định kiến trúc

AWS Hanoi Local Zone tạo khả năng đặt một phần workload gần người dùng Việt Nam hơn. Nó không tự động làm ứng dụng nhanh hơn, highly available hơn hay compliant hơn.

Kết quả 1.200 requests minh họa một điều rất cụ thể: di chuyển một tier đơn lẻ có thể tạo tác động ngược mong đợi nếu synchronous request path vẫn chứa nhiều database round trips tuần tự.

Trước khi chuyển từ lab sang production design, hãy trả lời ba câu hỏi:

1. **What should run locally?** Thành phần nào thật sự cần ở Hanoi?
2. **What should remain managed?** Thành phần nào nên ở Singapore để tận dụng Regional services?
3. **How should they communicate?** Luồng nào phải synchronous; luồng nào có thể batch, cache hoặc async?

Thiết kế tốt nhất không nhất thiết đặt mọi thứ trong Local Zone. Nó chọn đúng vị trí và cách giao tiếp cho từng thành phần, dựa trên performance evidence và business requirements.

> **Locality is an architecture decision, not a deployment checkbox.**

---

*Phạm vi bằng chứng: benchmark và engineering findings được tổng hợp từ AWS lab đã hoàn thành. Architecture A/B/C là reference designs để nghiên cứu và benchmark tiếp; chúng chưa được xác minh bằng cùng thí nghiệm 1.200 requests.*

*Nguồn fact-check chính, kiểm tra ngày 13/11/2026: [AWS Local Zones features](https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/), [AWS Local Zones locations](https://aws.amazon.com/about-aws/global-infrastructure/localzones/locations/), [Amazon EKS with Local Zones](https://docs.aws.amazon.com/eks/latest/userguide/local-zones.html), [Amazon EBS Local Snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html), [Amazon S3 directory bucket use cases](https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-bucket-use-cases.html) và [S3 directory bucket differences](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-differences.html).*
