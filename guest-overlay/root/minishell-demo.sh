#!/bin/sh

clear
printf '%s\n' 'Minishell portfolio demo'
printf '%s\n' 'Interactive shell running inside an Alpine guest on v86.'
printf '%s\n' 'Try: echo hello | cat, env, export, unset, pwd, cd, exit'
printf '\n'

cd /root || exit 1
exec /root/minishell