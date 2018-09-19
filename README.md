# nexus-cli
A command line tool for sonatype nexus 3.12+ .

This application depends on nexus rest api which is in beta release, so ensure nexus version before use it.

## Install

Just downlod executable binary from [release](https://github.com/ekuaibao/nexus-cli/releases)
and put to /usr/local/bin.

```
curl -L 'https://github.com/ekuaibao/nexus-cli/releases/download/v0.1/nexus-cli-v0.1-macos-x64' -o nexus-cli
mv nexus-cli /usr/local/bin/
```

## Usage

```
nexus-cli <command> [options]

commands:
    default      set default options to ~/.nexus/config.json .
    ls, list     list repository or components
    del, delete  delete components

options:
    -s, --server     <url>       Specify nexus server url.
    -u, --username   <username>  Specify username.
    -p, --password   <password>  Specify password.
    -r, --repository <name>      Specify name of repoistory.
    -f, --filter     <pattern>   Add filter pattern,
                                 repositories/components which match all patterns are listed.
                                 Support multiple --filter flags.
    -n, --number     <count>     Specify count of repositories/components listed.
    -o, --output     <format>    Specify output format: text, json.
    -h, --help                   Show help.
```

Examples:

* List all repositories:

   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list
   ```

* List 3 components in repository maven:

   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list -r maven -n 3
   ```

* List components by name:

   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list -r maven -f name:netty-all
   ```

We can use --filter (-f) option to find out components we want by matching any property of component.
Each component will be matched against all filter pattterns, and output if only all filters return true.
A pattern should be provided as the argument of -f option.

A pattern consists of following parts:
* An attribute name which is a property of json object returned from nexus rest api. We can show json via -o json option.
* An operator which is one of `~`,`:`,`>`,`<`.
    * `~` test value with a regular expression.
    * `:` check if value contains a string.
    * `>` and `<` compare value which is number or version. A full qualified version format like `major.minor.reversion.build-qualifier` .
* A operator argument used to match value.
    * If operator is `~`, this argument is a regular expression used to test property.
    * If operator is `:`, this argument is a string used to test property.
    * If operator is either `>` or `<`, this argument is a number or version to compare with property.

More examples:

* List components whose name starts with `nginx-` :
   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list -r docker -f name~^nginx-
   ```

* List components whose group contains `ekuaibao` :
   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list -r maven -f group:ekuaibao
   ```

* List components whose name contains `netty` and version less than `1.0` :
   ```
   nexus-cli -s https://repo.ekuaibao.com -u user -p password list -r maven -f name:netty -f 'version<1.0'
   ```

## Build

1. Install nodejs
1. Install pkg
   ```
   npm install -g pkg
   ```
1. Clone git repository:
   ```
   git clone https://github.com/ekuaibao/nexus-cli.git
   ```
1. Build binary release:
   ```
   pkg src/main.js -t node8-macos-x64 -o build/nexus-cli
   ```

Target platform should be specified when build with pkg. More info: https://github.com/zeit/pkg .
