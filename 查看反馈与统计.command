#!/bin/zsh
set -eu
printf '正在读取字帖最近 30 天统计和最近 50 条反馈…\n'
ssh hanjieserver 'python3 /opt/zitie-ai/community.py'
printf '\n按回车关闭。'
read -r reply
