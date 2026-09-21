# Shell 编码规范

> 适用范围:面向 Bash 4+ 的脚本开发,涵盖构建、开发辅助、部署编排与 CI 中的 shell 脚本。
> 目标平台以 Linux(Bash 4.2+/5)为主,兼顾 macOS 自带的 Bash 3.2(注意语法差异)与 Windows 下的 Git Bash/MSYS2。
> 本规范以「`set -euo pipefail` + 全部变量加引号 + shellcheck 零告警 + 安全执行」为核心基线,适用于 zcode-cli 项目中所有新增 `.sh` 脚本。
> 所有脚本必须在 Bash 下运行,禁止依赖 sh/posix 兼容而以牺牲 Bash 能力为代价。

## 1. 概述与使用时机

Shell 适合做「胶水」工作:调用外部命令、编排流程、管理文件与进程。它不适合承载复杂业务逻辑、复杂数据结构或高可靠状态机——这类逻辑应下沉到 PHP/Python/Go 等强类型语言。

本规范的核心目标:

- **健壮性**:用 `set -euo pipefail` 让脚本在意外失败时停止,而不是静默带病跑完。
- **可移植性**:显式声明用 `bash`,并在脚本内做平台差异处理(macOS/Windows)。
- **安全性**:全部变量展开加引号,杜绝空格路径与命令注入;临时文件用安全创建。
- **可审计性**:每个命令清晰、可读、可被 shellcheck 静态检查,退出码语义明确。

以下场景必须使用本规范:

| 场景 | 要求 |
| --- | --- |
| 新增 `.sh` 脚本 | 完全遵循 |
| 修改既有脚本 | 保持其公共接口(参数、退出码)的前提下遵循;改动接口先对齐 |
| 在 CI 中内联的 shell 步骤 | 至少遵循 `set -euo pipefail` 与引号、安全部分 |

## 2. 环境与工具链

### 2.1 Bash 版本假设

- 脚本首行写 `#!/usr/bin/env bash`,不要写绝对路径,以便 PATH 中选到合适版本。
- Linux 使用 Bash 4.2+ 或 5.x;macOS 自带的是 Bash 3.2,新增语法(如关联数组、`**` 全局、`read -N`)在 macOS 需谨慎或做版本检查。
- 用 `BASH_VERSINFO` 或在脚本明确「需要 Bash 4」并在顶部断言。

### 2.2 严格模式头

每个脚本开头统一放置如下头部,称为「严格模式」:

```bash
#!/usr/bin/env bash
# 严格模式:未设变量/命令失败/管道失败都立即退出
set -euo pipefail
IFS=$'\n\t'
```

- `set -e`:任何未捕获的非零退出码将使脚本退出。
- `set -u`:使用未定义变量时报错退出。
- `set -o pipefail`:管道中任一命令失败,整条管道的返回值为失败。
- `IFS` 固定为换行与 tab,避免 `*` 展开因空格分词出错。

### 2.3 shellcheck

- 所有脚本在提交与 CI 中运行 `shellcheck` 并保证零告警。
- 常用禁用规则要有注释说明,不要无理由禁。

```bash
# 本地检查整个 scripts 目录
shellcheck --shell=bash --severity=warning scripts/*.sh

# 在任何旗标难处理的动态构造处,用 # shellcheck disable 并说明理由
# shellcheck disable=SC2046  # 故意将换行拆开,前面的数组已校验
```

### 2.4 shellcheck 配置

```bash
# .shellcheckrc —— 统一的项目级配置
# 行业标准脚本头必须的严格模式相关检查保持开启
external-sources=true
disable=SC2230  # 项目中统一用 /usr/bin/env bash,故忽略 which 提示
```

### 2.5 mktemp 与临时目录

临时文件一律用 `mktemp`,并设置 `trap` 在退出时清理。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 创建不可预测的临时目录,并保证退出时删除
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

# 具体的临时文件放在该私有目录下
out_file="$tmp_dir/out.txt"
printf '%s\n' "hello" >"$out_file"
```

## 3. 命名与风格

### 3.1 命名约定表

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 脚本文件 | `snake_case.sh`,动词开头 | `build_release.sh` |
| 全局/环境变量 | `UPPER_SNAKE_CASE` | `PROJECT_ROOT`, `GIT_SHA` |
| 普通局部变量 | `lower_snake_case` | `output_dir`, `line_count` |
| 函数名 | `snake_case`,动词开头 | `ensure_deps`, `print_usage` |
| 只读常量 | `readonly UPPER_SNAKE_CASE` | `readonly MIN_TIMEOUT=5` |
| 布尔标志 | 前缀 `is_`/`has_` | `is_verbose`, `has_error` |
| 数组名 | 复数 `_list`/`_arr` | `tasks_arr`, `files_list` |
| 传给命令参数 | 明确变量的用途后缀 | `cmd_args`, `link_flags` |

### 3.2 正例与反例

```bash
#!/usr/bin/env bash
set -euo pipefail

# 正确命名:常量大写、局部小写、函数动词开头
readonly MIN_TIMEOUT=5
output_dir="$HOME/logs"

build_package() {
    local out="$output_dir/app.tar.gz"
    tar -czf "$out" ./dist
}

is_debug() {
    [[ "${DEBUG:-0}" == "1" ]]
}
```

```bash
# 反例:以下命名与写法不可使用
outputdir="$HOME/logs"      # 缺少下划线,可读性差
MY_VAR=$(date)              # 非环境变量却用大写,易与 env 混淆
BuildPackage() { :; }       # 函数用 PascalCase,与普通命令命名不一致
```

## 4. 语法与惯用法

### 4.1 条件判断与 `[[ ]]`

- 条件判断统一用 `[[ ]]`,不要用 `[ ]` 或裸 `test`。`[[ ]]` 不做分词/路径展开,支持 `=~` 正则。
- 数值比较用 `-eq`/`-lt`/`-gt`,字符串比较用 `==`,正则用 `=~`。

```bash
#!/usr/bin/env bash
set -euo pipefail

files_count=3
if [[ $files_count -lt 5 ]]; then
    echo "文件数量偏少"
fi

name="alice"
if [[ $name == *"li"* ]]; then
    echo "名字包含 li"
fi
```

### 4.2 引号规则

- 变量展开一律加双引号:`"$var"`、`"${array[@]}"`。
- 字面字符串不含需要转义的字符时用单引号,防止意外插值。
- 命令替换 `$(...)` 展开出现在裸位置时也要用引号包住结果。

```bash
#!/usr/bin/env bash
set -euo pipefail

file="/tmp/my file.txt"
# 变量必须加引号,否则存在空格时会拆成多个词
[[ -f "$file" ]] && printf '存在: %s\n' "$file"

# 命令替换结果同样加引号
user=$(id -un)
printf '当前用户: %s\n' "$user"

# 单引号 vs 双引号:单引号不做展开
version='v1.0'
path="$HOME/apps/$version"
```

### 4.3 字符串处理

- 使用 `${var//pattern/repl}`、`${var##*/}` 等参数展开处理路径与默认值。
- 取默认值用 `${var:-default}`;要求变量已定义但可为空用 `${var:=default}`(赋值形式慎用于 readonly)。
- 大文本处理交给 `awk`/`sed`,不要在 shell 内手写复杂循环。

```bash
#!/usr/bin/env bash
set -euo pipefail

config="a=b"
echo "${config#*=}"        # b,去掉最左的 "a="
echo "${config%=*}"        # a,去掉最右的 "=b"

name="${NAME:-guest}"      # NAME 未设置或为空时用 guest
port="${PORT:=8080}"       # 未设置时赋值并提供默认
```

### 4.4 数组

- Bash 4+ 支持索引数组与关联数组;关联数组在 macOS 默认 Bash 下不可用,需注意。
- 遍历数组一定用 `"${arr[@]}"`,不要在循环内重新分词。

```bash
#!/usr/bin/env bash
set -euo pipefail

files_list=(one.txt two.txt "three file.txt")
for f in "${files_list[@]}"; do
    printf '处理: %s\n' "$f"
done

# 关联数组(仅 Bash 4+)——linux 环境安全;macOS 需 bash 4 via brew
declare -A ports=( [web]=8080 [db]=5432 )
echo "${ports[web]}"   # 8080
```

### 4.5 参数与展开

- 用 `"$@"` 传递所有位置参数;不要用 `$*`(会把多个参数合并成一个带空格的词)。
- 解析参数使用 `getopts` 处理短选项;复杂长参数场景用循环 + `shift`。
- 位置参数少时用 `$1`、`$2`,但需要检查参数个数 `$#`。

```bash
#!/usr/bin/env bash
set -euo pipefail

print_all() {
    for arg in "$@"; do
        printf 'arg=%s\n' "$arg"
    done
}
print_all "a b" c

# 用 getopts 解析短选项
while getopts ":hv" opt; do
    case "$opt" in
        h) echo "usage: run.sh [-v]"; exit 0 ;;
        v) set -x ;;
        \?) echo "未知选项: -$OPTARG"; exit 1 ;;
    esac
done
shift $((OPTIND - 1))
```

### 4.6 引用与数组参数的安全传递

- 传给外部命令的参数若含空格,必须用数组保存每个参数再展开。
- 禁止用字符串变量去承载一个「带参数的命令」,那会重新分词产生注入可能。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 正确:每个参数独立成数组元素,展开时带引号
cmd_args=(--name "Jack Cooper" --dir "/tmp/a b")
command ls "${cmd_args[@]}"

# 反例:字符串丢进 eval / 介于引号中的命令,几乎必然出问题
# eval "ls $user_input"          # 危险,可能执行任意命令
```

## 5. 类型系统与内存

Shell 没有真正的类型系统,变量都是字符串(声明了 `-i`、`-a`、`-A` 属性的除外)。本规范约定:

### 5.1 变量作用域

- 函数内的一律用 `local` 声明;不要无声明直接写,避免意外覆盖全局。
- `readonly` 用于不允许被改写的常量。
- 全局变量命名大写以示区分;函数内局部变量小写 + `local`。

```bash
#!/usr/bin/env bash
set -euo pipefail

declare_env() {
    local n="${1:-unknown}"
    echo "$n"
}

readonly TOP_LEVEL_CONST=99
echo "$TOP_LEVEL_CONST"

# 全局环境变量仅出现在脚本开头或显式 export
export APP_ENV="${APP_ENV:-production}"
```

### 5.2 数值与声明类型

- 数值参与运算用 `(( ))` 或 `declare -i`;比对字符串数值要注意 `10 < 9` 这类坑。
- `declare -a` 声明索引数组、`declare -A` 声明关联数组、`declare -i` 声明整数。
- 需要避免把外部数据无校验地当作整数。(`(( ))` 内求值为数时注意与退出码,见第 11 节。)

```bash
#!/usr/bin/env bash
set -euo pipefail

declare -i total=0
for n in 3 5; do
    total+=n
done
echo "$total"   # 8

# 字符串还是数字:统一先规范化再判断
raw="007"
if [[ $raw =~ ^[0-9]+$ ]]; then
    printf '是纯数字: %s\n' "$raw"
fi
```

### 5.3 大循环与内存

- Shell 处理大数据集慢且占内存,超过几万行的文件交给 `awk`/`sed`/`sort`/`jq`。
- 需要保留多条记录用数组/文件,不要把所有内容拼进一个巨型字符串。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 处理大数据集:用外部工具而非纯 shell 循环
awk '{ sum += $1 } END { print sum }' /tmp/numbers.txt

# 读取一批行到数组,再处理
mapfile -t lines < /tmp/config.list
for line in "${lines[@]}"; do
    echo "$line"
done
```

## 6. 错误处理

### 6.1 `set -euo pipefail` 的边界

- `set -e` 不会在 `if` 条件、`&&`/`||` 左侧、`!` 前置的命令失败时退出,这是特性而非缺陷。
- 需要「容忍某条命令失败」时,显式捕获:`if cmd; then ...; else ...; fi` 或用 `|| { ...; }`。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 失败即中止的例子:pip 装依赖失败会直接退出
pip install -r requirements.txt

# 显式允许失败的例子:目标目录可能不存在
if mkdir -p /opt/app/log; then
    echo "目录就绪"
else
    echo "已存在或创建失败(不致命)"
fi
```

### 6.2 退出码与函数返回

- 脚本退出码反映真实语义:`0` 成功,`1` 一般性失败,`2` 用法错误,`128+` 由信号跳转。
- 函数用 `return 非零` 表达失败;主流程根据返回值分支。
- 不要依赖 `set -e` 覆盖所有场景,`command` 之间要明确意图。

```bash
#!/usr/bin/env bash
set -euo pipefail

check_config() {
    local cfg="$1"
    if [[ ! -f "$cfg" ]]; then
        echo "缺少配置:$cfg" >&2
        return 1
    fi
    return 0
}

if check_config "/tmp/app.conf"; then
    echo "配置检查通过"
else
    echo "配置检查失败,以用法错误退出" >&2
    exit 2
fi
```

### 6.3 自定义错误函数

- 定义统一错误函数,统一格式输出到 stderr,并带明确退出码。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 统一报错出口:打印到 stderr 并以指定码退出
die() {
    local msg="${1:-未知错误}"
    local code="${2:-1}"
    printf '错误: %s\n' "$msg" >&2
    exit "$code"
}

if [[ -z "${REQUIRED_VAR:-}" ]]; then
    die "缺少必需的 REQUIRED_VAR 环境变量" 3
fi
```

## 7. 异步与并发

### 7.1 后台作业

- 用 `&` 启动后台任务,用 `wait` 等待(在 `set -e` 下 `wait` 失败会返回异常使得脚本退出)。
- 收集所有后台 PID 到一个数组,统一 `wait`,并检测任一失败。

```bash
#!/usr/bin/env bash
set -euo pipefail

pids=()
for i in 1 2 3; do
    ( sleep "$i"; echo "done-$i" ) &
    pids+=("$!")
done

fail=0
for pid in "${pids[@]}"; do
    wait "$pid" || fail=1
done
if [[ $fail -eq 1 ]]; then
    echo "至少一个后台任务失败" >&2
    exit 1
fi
```

### 7.2 使用 `trap` 做清理

- 除了自动 `rm -rf "$tmp_dir"`,还应 `trap` 处理 `INT`/`TERM`/`HUP`。
- trap 清理须能容忍「未创建的路径」;清理逻辑保持幂等。

```bash
#!/usr/bin/env bash
set -euo pipefail

tmp_dir=$(mktemp -d)
pid_file="$tmp_dir/server.pid"

cleanup() {
    echo "清理中..."
    # 幂等:文件存在才 kill,避免信号时重复执行
    [[ -f "$pid_file" ]] && kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM
```

### 7.3 并发安全

- 多实例写同一文件需加锁;使用 `flock` 避免竞态。
- 输出重定向到共享日志时用 `set -o noclobber`(谨慎)或每次用追加方式。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 用 flock 保证同一时刻只有一个实例执行临界区
critical_section() {
    exec 9>/var/lock/my-job.lock
    flock 9 || die "无法获得锁"
    # 临界区:受保护的操作
    echo "事务开始" >&2
    sleep 1
    echo "事务结束" >&2
    flock -u 9
}
```

## 8. 结构与架构

### 8.1 目录与脚本分层

- 脚本按用途放到独立目录:`scripts/`(构建/开发)、`ci/`(CI 专用)、`deploy/`(部署)。
- 可复用的函数放进 `scripts/lib/*.sh`,用 `source` 引入,不要复制粘贴。

```text
scripts/
├── build.sh             # 构建入口
├── check.sh             # 集成检查
├── lib/
│   ├── common.sh        # 共享函数与 die/log
│   ├── git_ops.sh
│   └── platform.sh      # 平台差异处理
└── deploy.sh
ci/
└── run_in_ci.sh         # CI 专用编排
```

### 8.2 函数化与单一职责

- 每个函数只做一件事,名字体现意图;超过一个屏幕的函数要拆分。
- 入口脚本只做参数解析 + 调用函数,业务放函数里,便于复用与单元验证。

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/common.sh"

# 单一职责:负责版本校验
assert_git_clean() {
    if [[ -n "$(git status --porcelain)" ]]; then
        die "工作区不干净,请先提交" 2
    fi
}

main() {
    assert_git_clean
    run_build
    run_tests
}
main "$@"
```

### 8.3 状态 owner

- 临时变量/脚本级状态集中在脚本顶部;不要让函数相互隐式共享「魔法环境变量」。
- 传参而非依赖外部隐式变量,明确数据流,避免「两条修改路径」。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 状态集中声明,函数通过参数接收,而不是读隐式全局
output_dir="$PWD/dist"
build_artifact() {
    local target="$1"          # 数据从参数进,不走全局
    command cp "$target" "$output_dir/"
}
build_artifact ./app
```

## 9. 构建 / 测试 / 发布

### 9.1 构建脚本模板

- 构建脚本保证可在 CI 与本地一致运行,先 `bash -n` 语法检查。
- Git 检出即用(`clean checkout`),产物输出到独立目录。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 语法检查(在任何 CRLF/引号问题炸之前暴露)
bash -n "$0"

# 2. 明确根目录与产物目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
mkdir -p "$DIST_DIR"

# 3. 构建动作
(cd "$PROJECT_ROOT" && composer install --no-dev --prefer-dist)
command cp -r "$PROJECT_ROOT/src" "$DIST_DIR/"
echo "构建完成 -> $DIST_DIR"
```

### 9.2 测试写法(用 shellcheck + bats)

- 语法/静态检查:`bash -n`、`shellcheck`。
- 行为测试用 `bats-core`(可选),断言输入/输出/退出码。

```bash
#!/usr/bin/env bash
set -euo pipefail

# check.sh —— 静态与语法门禁
echo "==> 语法检查"
find scripts -name '*.sh' -print0 | xargs -0 -n1 bash -n

echo "==> shellcheck"
find scripts -name '*.sh' -print0 | xargs -0 -n1 shellcheck --severity=error
echo "全部通过"
```

```bash
#!/usr/bin/env bats
# tests/script.bats —— bash 行为测试(bats-core)
@test "die 应输出到 stderr 并以指定码退出" {
    run scripts/lib/common.sh __die_test 3
    [ "$status" -eq 3 ]
    [[ "$output" == *"错误"* ]]
}
```

### 9.3 CI 集成

```yaml
# .github/workflows/shell.yml 片段
jobs:
  shell:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get install -y shellcheck
      - name: Lint shell 脚本
        run: find scripts -name '*.sh' -print0 | xargs -0 -n1 shellcheck
```

## 10. 安全与性能要点

- **命令注入**:不 `eval` 用户输入;参数数组传给命令,不使用字符串拼接再 shell 展开。
- **引号与分词**:所有变量加引号,防止空格/通配符路径出问题与注入。
- **临时文件安全**:`mktemp` + 0600 权限 + trap 清理,不写固定可预测路径。
- **不要信任外部输入**:如果必须用于文件名,先校验字符集(如 `/^[A-Za-z0-9._-]+$/`)。
- **性能**:大数据用 `awk`/`jq`/`sort`,避免 shell 内循环取代工具。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 安全:输入经过校验后再作为文件名使用
sanitize_name() {
    local raw="$1"
    if [[ ! "$raw" =~ ^[A-Za-z0-9._-]+$ ]]; then
        die "非法文件名: $raw" 2
    fi
    printf '%s' "$raw"
}

user_file="$(sanitize_name "$INPUT_NAME")"
tmp=$(mktemp)
chmod 0600 "$tmp"
trap 'rm -f "$tmp"' EXIT
printf '%s\n' "$user_file" >"$tmp"
```

## 11. 常见陷阱与反模式

### 陷阱 1:变量不加引号
- 路径含空格时被拆成多个参数,命令行为错乱甚至危险。
- 修正:一律 `"$var"`;数组 `"${arr[@]}"`。

```bash
#!/usr/bin/env bash
file="My Documents/a.txt"
# 反例:[[ -f $file ]] 会拆词失败
# 修正:
[[ -f "$file" ]]
```

### 陷阱 2:滥用 `eval`
- `eval` 会把字符串当作代码再执行,用户输入等于任意代码执行。
- 修正:用数组 + 引号展开,绝不对不可信输入使用 eval。

### 陷阱 3:`(( ... ))` 进 `set -e`
- `(( 0 ))` 求值为 0,退出码为 1,在 `set -e` 下会中止脚本。
- 修正:数值判断用 `-eq`/`-lt`,或用 `if (( ... ))` 显式分支。

```bash
#!/usr/bin/env bash
set -euo pipefail
n=0
# 反例:直接 (( n )) 在 n=0 时因退出码 1 导致脚本退出
if (( n )); then
    echo "非零"
else
    echo "零或空"
fi
```

### 陷阱 4:`mkdir`/命令在 `&&` 左侧被静默跳过
- `set -e` 不覆盖 `&&` 左侧失败,容易漏掉必要前提。
- 修正:前置命令显式处理失败。

### 陷阱 5:把 `cd` 后的相对路径当真
- `cd` 失败后继续执行,相对路径指向了错误目录。
- 修正:`cd "$dir" || die "无法进入 $dir"`,或使用绝对路径变量。

```bash
#!/usr/bin/env bash
set -euo pipefail
# 反例:cd target 失败仍继续
# cd /nonexistent && run_here

# 修正:
cd /nonexistent || { echo "目录不存在" >&2; exit 1; }
```

### 陷阱 6:硬编码平台命令(如 `sed -i`,macOS 写法不同)
- macOS 的 `sed -i` 需要备份后缀(如 `sed -i ''`),Linux 不需要。
- 修正:把平台差异隔离到 `lib/platform.sh`,见第 8 节。

```bash
#!/usr/bin/env bash
set -euo pipefail
# 跨平台 sed 原地替换
sed_inplace() {
    local file="$1" expr="$2"
    if [[ $(uname) == "Darwin" ]]; then
        sed -i '' "$expr" "$file"
    else
        sed -i "$expr" "$file"
    fi
}
```

### 陷阱 7:mtime 相关 `find ... -exec` 的退出码问题
- 大批量文件中,个别 `find -delete` 失败可能被忽略。
- 修正:显式检查并用周期 `|| die`。

### 陷阱 8:依赖 Bash 3 没有的特性而不自知
- 关联数组、`**`、`read -N`、`mapfile` 在 macOS 默认 bash 3.2 不可用。
- 修正:需要这些特性时,通过 brew 安装 bash 或在脚本顶部校验版本。

```bash
#!/usr/bin/env bash
set -euo pipefail
if [[ "${BASH_VERSINFO[0]:-0}" -lt 4 ]]; then
    echo "需要 Bash 4+(请安装较新版本)" >&2
    exit 1
fi
```

### 陷阱 9:`read` 默认按词拆分
- `while read` 遇到含空格的整行会拆错。
- 修正:`IFS= read -r line`,多用 `-r` 防反斜杠转义。

```bash
#!/usr/bin/env bash
set -euo pipefail
while IFS= read -r line; do
    echo "整行: $line"
done < /tmp/data.txt
```

### 陷阱 10:把 Windows CRLF 混进脚本
- 在 Windows 用 Git Bash 时,文件被 checkout 成 CRLF,`#!/usr/bin/env bash` 末尾 `\r` 会让 shebang 失效。
- 修正:提交 `.gitattributes` 强制 `*.sh text eol=lf`。

### 陷阱 11:临时文件用固定名
- `/tmp/a.txt` 多进程同时写会互相覆盖/损坏。
- 修正:`mktemp` + 权限 + trap(见第 2、10 节)。

### 陷阱 12:无限/错误的 `while read` 子 shell 作用域
- `for ... | while read` 管道后的 `while` 在子 shell 中,修改的变量不会保留在主 shell。
- 修正:用 `while read` 读传入的重定向 `< file`,或用 `mapfile`。

```bash
#!/usr/bin/env bash
set -euo pipefail
# 反例:管道内 sub-shell 修改 count 不会回流
cat /tmp/list | while read -r line; do ((count++)); done

# 修正:
count=0
while read -r _line; do ((count++)); done < /tmp/list
echo "$count"
```

### 陷阱 13:依赖当前工作目录
- 脚本从别的目录被调用时路径全错。
- 修正:用 `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` 固本地解析。

### 陷阱 14:printf 里使用未转义 `%`
- `printf %s "$x"` 才安全;`printf "$x"` 会把 `%` 当格式符导致输出错乱甚至崩溃。
- 修正:格式串固定,变量作为参数传入。

```bash
#!/usr/bin/env bash
set -euo pipefail
x="100% done"
printf '%s\n' "$x"     # 正确:变量作参数
# printf "$x\n"        # 错误:% 被当作格式占位
```

### 陷阱 15:忽略命令替换的非零退出码
- `$(...)` 内部失败在部分情况不影响整句退出(`set -e` 不覆盖赋值右侧)。
- 修正:对关键替换的结果做显式校验,或用 `local out; out=$(cmd) || die`。

## 12. 自查检查清单

- [ ] 首行是 `#!/usr/bin/env bash`
- [ ] 已设置 `set -euo pipefail`,并按需 `IFS=$'\n\t'`
- [ ] 每个变量展开都加了双引号或 `"${arr[@]}"`
- [ ] 数组总是以 `"${arr[@]}"` 方式遍历/展开
- [ ] `eval` 未出现在任何脚本中(或满注释理由)
- [ ] 临时文件都用 `mktemp`,并 `trap` 清理
- [ ] 所有 `cd` 都带失败处理(`|| die …`)或使用绝对路径
- [ ] `read` 均使用 `if IFS= read -r` 或 `mapfile`
- [ ] 平台差异(如 `sed -i`)集中在 `lib/platform.sh`
- [ ] 大文本处理使用 `awk`/`sed`/`jq`,而非纯 shell 大循环
- [ ] `bash -n` 语法检查通过
- [ ] `shellcheck` 在当前脚本下零 error 告警
- [ ] 函数的返回值与退出码语义明确且文档化
- [ ] 后台作业的返回被显式检查(pids 数组 + wait 循环)
- [ ] trap 处理 `EXIT`/`INT`/`TERM` 且幂等
- [ ] 脚本状态集中在顶部,函数通过参数接收数据
- [ ] 文件统一 `LF` 行尾(`.gitattributes` 覆盖)
- [ ] 面向 Bash 4 的特性(关联数组等)有版本兜底或已获满足
- [ ] 不依赖当前工作目录;入口用 `BASH_SOURCE` 定位基准目录

## 13. 参考资料

- GNU Bash Reference Manual(Bash 4.x/5.x)。
- ShellCheck 文档与 SC 编号说明。
- Google Shell Style Guide —— 命名与引号惯例参考。
- bats-core 文档 —— Bash 行为测试框架。
- macOS Bash 3.2 与 Linux Bash 5 的差异清单。