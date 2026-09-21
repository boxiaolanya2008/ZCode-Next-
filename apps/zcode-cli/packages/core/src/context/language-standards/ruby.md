# Ruby 编码规范

> 本规范适用于仓库中以 Ruby 3.x 编写的一切代码，包括库、CLI 工具、脚本与基于 Rails/Sinatra 的 Web 服务。目标读者是本仓库的工程师与 code-review 评审者。规范以"约定优于配置、可读性优先、正确利用动态特性"为原则，为每条规则给出可直接落地的示例。

## 1. 概述与使用时机

Ruby 是一门动态、注重程序员幸福的脚本语言，以其块（block）、对象模型与魔法般的 DSL 著称。

- 当需要快速构建应用、写脚本、或利用成熟的 Rails 生态时优先选用 Ruby。
- 当涉及大规模数值计算或需要极致性能时，先评估是否有 Ruby 之外的更优选择，并明确取舍。
- 默认使用 Ruby 3.x（推荐 3.1+），关闭非必要的旧特性，尽量开启 `warning` 与静态检查。
- 本规范同时适用普通 Ruby gem 与 Rails 应用；涉及 Rails 的约定在第 8 节单独说明。

## 2. 环境与工具链

### 2.1 版本管理与依赖

使用 `RVM`/`rbenv`/`mise` 固定 Ruby 版本，用 `Gemfile` + `bundler` 管理依赖，并提交 `Gemfile.lock`。

```ruby
# Gemfile —— 声明依赖群组与版本约束
source "https://rubygems.org"

ruby "3.1.4"

gem "rails", "~> 7.1"
gem "puma",  "~> 6.4"

group :development, :test do
  gem "rspec-rails", "~> 6.1"
  gem "rubocop",     require: false
  gem "rubocop-rails", require: false
end
```

```bash
# 安装并固定依赖
bundle install
bundle exec rubocop
bundle exec rspec
```

### 2.2 代码风格与静态检查

- 一律使用 rubocop + rubocop-rails，配置 `.rubocop.yml`。
- 提交前运行 `bundle exec rubocop -A`（自动修正后再人工复核改动）。
- RuboCop 规则纳入 CI，禁止整体 `--disable` 后无人跟进。

```yaml
# .rubocop.yml —— 团队统一风格
AllCops:
  TargetRubyVersion: 3.1
  NewCops: enable
  Exclude:
    - "db/schema.rb"

Style/StringLiterals:
  EnforcedStyle: single_quotes

Metrics/MethodLength:
  Max: 20
```

### 2.3 常用命令速查

```bash
bundle exec rails s       # 启动开发服务器
bundle exec rails test    # 运行测试
bundle exec rspec         # 运行 RSpec
bundle exec rubocop -A    # 自动修正风格
bundle exec rake -T       # 查看可用任务
```

## 3. 命名与风格

### 3.1 命名约定表格

| 目标                 | 约定                  | 示例                             |
| -------------------- | --------------------- | -------------------------------- |
| 类、模块             | PascalCase           | `User`、`PaymentProcessor`       |
| 方法、变量           | snake_case            | `find_by_id`、`retry_count`      |
| 常量                 | SCREAMING_SNAKE_CASE  | `MAX_RETRIES`、`DEFAULT_PORT`    |
| 实例变量             | 前导 `@` snake_case   | `@current_user`                  |
| 类变量(尽量减少)     | 前导 `@@` snake_case  | `@@instance_pool`                |
| 布尔谓词方法         | 以 `?` 结尾           | `valid?`、`empty?`、`admin?`     |
| 危险/破坏性方法      | 以 `!` 结尾           | `save!`、`reject!`、`delete!`    |
| 批量/迭代方法        | 以 `each`/`map` 等动词结尾 | `each_visible`、`map_values` |

### 3.2 正反例

```ruby
# 反例：命名混乱、风格不一致
def GetUser(id); end        # camelCase 方法
class data_processor; end   # snake_case 类名
MAX_VALUE = 5               # 常量用小写开头
def is_verified; true; end  # 不应加 is_ 前缀，Ruby 用问号

# 正例：遵循约定，语义清晰
class User
  def find(id) = ...
  def verified? = true
end
MAX_RETRIES = 5
```

### 3.3 风格细节

- 缩进两空格，禁止制表符；每行尽量 ≤ 100 字符。
- 方法名用动词开头，谓词以 `?` 结尾，这是 Ruby 惯用法的核心。
- 只在明确表示"可能会修改接收者或抛出异常"时用 `!`，并保持成对提供。

## 4. 语法与惯用法

### 4.1 块（Block）、Proc 与 Lambda

块是最重要的惯用法。优先内联块、收集上下文用 `Proc`、需要返回值语义用 `lambda`。

```ruby
# 用 each/map 等自带块的迭代
users.map { |u| u.name }
users.select(&:admin?)

# 收集一次性参数用 Proc
printer = ->(x) { puts x }
[1, 2, 3].each(&printer)

# 生成惰性枚举器
enum = (1..Float::INFINITY).lazy.select(&:even?).take(5)
enum.to_a # => [2, 4, 6, 8, 10]
```

### 4.2 便捷语法糖

`&:method`、守卫临时变量、安全导航、隐式块等等效写法让代码更简短，但要保持可读。

```ruby
values  = [1, 2, 3, 4]
doubled = values.map { |v| v * 2 }          # 完整块
doubled = values.map(&:some_method)         # 符号转 proc，含义一致
config  = params[:config] || DEFAULT        # 兜底默认值
name    = user&.profile&.name                # 安全导航，避免裸 != nil 判断
```

### 4.3 字符串与符号（Symbol）

- 需要插值/修改的用字符串（`String`），作为权标、键、方法名的用符号（`Symbol`）。
- 避免无意义的符号转字符串，除非明确需要。

```ruby
status  = :active                          # 无歧义的权标用 Symbol
label   = "user_#{id}"                      # 需要拼接的用 String interpolation
config.key?(:timeout) or config.key?('timeout') # 键统一用 Symbol 防止混用
```

### 4.4 哈希与关键字参数

Ruby 3 移除自动转换歧义，显式用关键字参数传递具名选项。

```ruby
def configure(host:, port: 80, ssl: true)
  puts "#{host}:#{port} ssl=#{ssl}"
end

# 用关键字参数而非裸哈希，防止拼写错误被吞
opts = { host: 'api.example', port: 443 }
configure(**opts)
```

### 4.5 Optional-only: 避免过度 Magic

`method_missing`、`define_method`、`instance_eval` 是强大但危险的魔法，用于 DSL 边界且必须有护栏。

```ruby
# 反例：把所有未定义方法都吞掉，掩盖拼写错误
class Widget
  def method_missing(name, *_a); "got #{name}"; end
end

# 正例：只在白名单内动态响应
class Widget
  ALLOWED = %i[width height].freeze
  def method_missing(name, *_a)
    return public_send("proxy_#{name}") if ALLOWED.include?(name)
    super
  end
  def respond_to_missing?(name, inc = false) = ALLOWED.include?(name) || super
end
```

## 5. 类型系统与内存

### 5.1 动态类型的克制

Ruby 是动态类型，但要在公共接口处做清晰约定：注释、类型（RBS/rdoc）、或轻量校验。

```ruby
# 反例：参数与返回类型不明，调用方易错
def add(a, b); a + b; end

# 正例：说明预期类型，必要时守卫
# 返回: Integer 之和；调用方需传数值。
def add(numeric_a, numeric_b)
  raise ArgumentError, 'expected Numeric' unless numeric_a.is_a?(Numeric) && numeric_b.is_a?(Numeric)
  numeric_a + numeric_b
end
```

### 5.2 防御式动态守卫

外部输入进入可信边界前做类型/值守卫，拒绝非法值优于依赖隐式失败。

```ruby
require 'date'

def parse_iso8601(str)
  raise ArgumentError, "bad date: #{str.inspect}" unless str.is_a?(String) && str.match?(/\A\d{4}-\d{2}-\d{2}\z/)
  Date.iso8601(str)
end
```

### 5.3 内存管理

- 对象字面量/常量默认可变，用 `.freeze` 固化不可变常量，避免意外被改。
- 大集合流式处理，用 `each`/`lazy`/`Enumerator` 替代一次 `map(...).to_a` 全量载入。
- 大量字符串拼接用 `String#<<` 或 `<<"..."`，避免反复重建字符串。

```ruby
WHITELIST = %w[a b c].freeze            # 冻结常量，防止被修改
BUFFER = +""                             # 需要原地追加的字符串
lines.each { |l| BUFFER << l }          # 单个字符串反复追加
```

## 6. 错误处理

### 6.1 begin/rescue/ensure 原则

- 只在可能失败的边界使用 `begin/rescue`；业务主流程尽量少用控制流异常。
- `ensure` 用于释放资源；Ruby 3 更多场景用 `Block form` + ensure 内清理。
- 捕获具体异常类，避免裸 `rescue => e` 吞掉一切。

```ruby
def read_first_line(path)
  File.open(path, 'r') do |f|
    f.readline.chomp
  end
rescue Errno::ENOENT => e
  Rails.logger.warn("missing file #{path}")
  nil
ensure
  nil # 若需强制清理，可在此执行 release 操作
end
```

### 6.2 让异常可控（Fail fast / rescue 局部化）

```ruby
def process(order)
  # 校验失败立即抛带上下文的错误，而不是返回假值一路渗透
  raise OrderError, "order #{order.id} not payable" unless order.payable?
  payment = order.charge!
  RecordPayment.call(payment)
rescue PaymentGatewayError => e
  metrics.increment(:payment_failed)
  raise # 用 raise 重抛，保留原栈供上层处理
end
```

### 6.3 避免使用 rescue 做业务分支

```ruby
# 反例：用异常表达"没找到"，性能与语义都差
begin
  user = User.find(id)
rescue ActiveRecord::RecordNotFound
  user = nil
end

# 正例：用先查询再判断或 find_by 返回 nil 的语义化写法
user = User.find_by(id: id)
```

## 7. 异步与并发

### 7.1 线程与并发模型

CRuby 有 GVL，需注意块锁粒度；`Thread` 协作式低成本，用 `Mutex`/`Queue` 协调共享状态。

```ruby
queue   = Queue.new
threads = 4.times.map do
  Thread.new { loop { item = queue.pop; process(item) rescue nil } }
end
```

### 7.2 线程安全

共享可变状态要受临界区保护；全局单例方法尽量只读或自带锁。

```ruby
class AtomicCounter
  def initialize = @mutex = Mutex.new; @count = 0
  def increment
    @mutex.synchronize { @count += 1 }
  end
  def value = @mutex.synchronize { @count }
end
```

### 7.3 轻量异步：Ractor（Ruby 3）与 Fiber

- 并行数值任务用 `Ractor`（数据拷贝隔离）；注意不共享可变对象。
- 协作式 I/O 等待可用 `Fiber`/`async` 或 `Timeout` 保护。

```ruby
# Ractor 并行处理，收到放大拷贝隔离
ractor = Ractor.new { Ractor.receive * 2 }
ractor.send(21)
ractor.take.to_s   # => "42"
```

### 7.4 Mutex 反模式

避免在持有锁时调用可能触发重入或长时间网络的方法，防止死锁与性能落差。

```ruby
# 反例：持锁期间做外部网络调用
@mutex.synchronize { HTTP.get(url) }

# 正例：先取数据，锁外做网络；锁只保护共享数据本身
payload = @mutex.synchronize { @shared.dup }
result  = HTTP.get(payload.fetch(:url))
```

## 8. 结构与架构

### 8.1 应用分层（Rails 惯例为主）

- Model 只承载数据与业务规则；Controller 只做编排；Presenter/Service 放复杂逻辑。
- 允许引入 Service 对象承载用例，但别把一切堆进 Controller 或 Model。

```
app/
  controllers/
  models/
  services/       # 用例/编排
  presenters/
  policies/       # 授权
  jobs/           # 后台任务
  mailers/
lib/
  my_app/
    report_builder.rb
test/
  services/
    report_builder_test.rb
```

### 8.2 Service 对象示例

```ruby
class PayOrder
  Result = Data.define(:ok, :order, :error)

  def self.call(**kwargs) = new(**kwargs).call

  def initialize(order:, gateway: PaymentGateway)
    @order   = order
    @gateway = gateway
  end

  def call
    return Result.new(ok: false, order: @order, error: 'unpayable') unless @order.payable?
    Result.new(ok: true, order: @order, error: nil)
  end
end
```

### 8.3 状态唯一 owner

- 每个可变状态/外键只允许单一写入路径，避免多处 `update_attributes` 竞争。
- 时区、配置等全局状态在启动时初始化并在 owner 内管理，不要在各处覆盖。

```ruby
# 反例：多处代码更新同一对象不同字段造成竞态
order.status = 'paid'
# ...其他线程又 order.status = 'pending'

# 正例：只允许 Order#mark_paid! 明确收敛写入
class Order
  def mark_paid!
    raise StateError unless states.include?(:paid) # 状态机限定
    update!(status: :paid, paid_at: Time.current)
  end
end
```

## 9. 构建 / 测试 / 发布

### 9.1 构建命令

```bash
bundle install --path vendor/bundle
bundle exec rubocop
bundle exec rails test / bundle exec rspec
bundle exec rails assets:precompile
bundle exec gem build my_gem.gemspec   # 若为 gem
```

### 9.2 测试写法（RSpec / minitest）

- 一条测试一个行为断言；用描述性标题。
- 外部依赖用 mocking（如 `allow`/`expect`）隔离，测试不依赖真实网络。

```ruby
require 'rails_helper'

RSpec.describe PayOrder do
  subject(:service) { described_class.new(order:, gateway: fake) }
  let(:fake) { instance_double(PaymentGateway) }
  let(:order) { build_stubbed(:order, :payable) }

  it 'returns ok result for payable order' do
    result = service.call
    expect(result.ok).to be(true)
  end
end
```

### 9.3 CI

```yaml
# .github/workflows/ruby.yml（节选）
steps:
  - uses: ruby/setup-ruby@v1
    with: { bundler-cache: true }
  - run: bundle exec rubocop
  - run: bundle exec rspec
```

## 10. 安全与性能要点

### 10.1 动态特性与注入

模板/查询拼接是注入高危点，一律用参数化或 Rails 的生成器。

```ruby
# 反例：字符串拼接 SQL，注入风险
User.where("name = '#{params[:q]}'")

# 正例：参数化查询
User.where('name = ?', params[:q])
User.where(name: params[:q])          # Rails 数组/哈希形式
```

### 10.2 强参数与 Mass Assignment

Rails 使用 `require/permit` 白名单，绝不传整棵 `params` 给 `update`。

```ruby
def user_params
  params.require(:user).permit(:name, :email, :role)
end

def update
  @user.update!(user_params) # 只允许白名单字段
end
```

### 10.3 性能要点

- 用 `.size`/`.empty?`/`.any?` 而非 `count > 0` 触发的全表扫描（DB 层）。
- 避免在循环内反复查询；一次取数 + 内存聚合。
- 热点代码用 `Benchmark`/`rbtrace` 定位后再优化，不凭直觉。

```ruby
# 反例：N+1
users.each { |u| p u.posts.size }   # 每次迭代触发查询

# 正例：include/eager_load 一次取关联
User.includes(:posts).each { |u| p u.posts.size }
```

### 10.4 性能细节

```ruby
# 用 each 让我们按 Enumerator 惰性处理大文件
File.foreach('data.log') { |line| process(line) }
```

## 11. 常见陷阱与反模式

【陷阱 1】用 `==` 比较浮点相等导致不稳定判断。

【修正】比较时允许误差范围或转整数（`(a-b).abs < 1e-9`），不要裸 `==`。

```ruby
# 反例
0.1 + 0.2 == 0.3  # => false
# 正例
(0.1 + 0.2 - 0.3).abs <= 1e-9  # true
```

【陷阱 2】`attr_accessor` 过度暴露属性和状态。

【修正】私有默认，显式 `attr_reader`/`attr_writer`，仅在需要处开放。

【陷阱 3】裸 `rescue => e` 吞掉错误。

【修正】捕获具体异常类，记录日志，必要时 `raise` 重抛。

【陷阱 4】用异常做控制流（如 `rescue RecordNotFound` 判空）。

【修正】用 `.find_by` 返回 nil 或 `find_by!` 语义化表达。

【陷阱 5】Symbol/字符串键混用导致哈希取值失败。

【修正】统一为 Symbol 键，配置文件中用字符串再转换一次。

【陷阱 6】滥用 `method_missing` 隐藏真实方法名。

【修正】限定白名单并实现 `respond_to_missing?`，否则在 CI 覆盖真名调用。

【陷阱 7】跨线程共享未同步的可变对象。

【修正】用 Mutex/Queue，或改用 Ractor 拷贝隔离。

【陷阱 8】持有锁时做网络/长操作。

【修正】锁内只复制数据，锁外做 IO（见 7.4）。

【陷阱 9】N+1 查询导致性能陡降。

【修正】`includes`/`preload`/`eager_load` 预加载关联。

【陷阱 10】整棵 `params` 传给 `update` 造成 mass assignment。

【修正】永远用 `require/permit` 白名单。

【陷阱 11】字符串拼接 SQL/HTML 注入漏洞。

【修正】参数化查询、模板转义、Rails helper。

【陷阱 12】`save` 静默返回 false 而不检查。

【修正】用 `save!` 或显式检查 `save` 返回值并处理失败。

【陷阱 13】全局可变常量未 `freeze`，运行时被意外修改。

【修正】常量用 `.freeze`，需要可写时改用方法返回 dup。

【陷阱 14】`nil` 判定过散、`&.` 一个接一个掩盖错误。

【修正】在进入调用前确认数据完整（\_.presence/\_.to_h），限制 `&.` 层数。

【陷阱 15】在循环里反复 `String#+` 重建大字符串。

【修正】用 BUFFER + `<<`（见 5.3）。

## 12. 自查检查清单

- [ ] 已固定 Ruby 版本（.ruby-version/rbenv/mise.toml）
- [ ] 依赖在 `Gemfile` 中分组，未直接 `gem install` 后不清依赖
- [ ] 提交前已运行 `bundle exec rubocop -A`
- [ ] rubocop 规则已纳入 CI 失败门槛
- [ ] 类/模块与文件命名符合 Ruby 文件命名约定
- [ ] 方法与变量用 snake_case，谓词以 `?` 结尾
- [ ] `!` 方法只用于确实修改接收者或会抛异常的语义
- [ ] 缺少"会被重复利用"的字符串已使用冻结常量或明确字符串缓冲
- [ ] 未用裸 `rescue => e` 吞掉进展不明的异常
- [ ] 捕获具体异常类，并在必要时 `raise` 重抛
- [ ] 未用异常做常规业务分支
- [ ] 参数为显式关键字参数而非裸哈希
- [ ] 字符串与 Symbol 键未混用
- [ ] 共享状态有明确 owner，无多处乱写
- [ ] 未用整棵 params 做 mass assignment，已 `permit`
- [ ] 查询已参数化，无 SQL/模板字符串拼接
- [ ] 外部请求/N+1 已通过 `includes` 或锁外处理优化
- [ ] 常量已 `freeze`
- [ ] 测试已隔离外部服务，用 mock 而非真实网络
- [ ] CI 执行了 rubocop（或 lint）与测试

## 13. 参考资料

- Ruby 官方文档：https://www.ruby-lang.org/zh_cn/documentation/
- RuboCop：https://docs.rubocop.org/
- Rails 指南：https://guides.rubyonrails.org/
- Bundler 文档：https://bundler.io/guides/
- RSpec：https://rspec.info/