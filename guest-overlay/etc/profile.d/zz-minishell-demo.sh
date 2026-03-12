#!/bin/sh

case "$-" in
    *i*) ;;
    *) return 0 ;;
esac

if [ -n "${MINISHELL_PORTFOLIO_STARTED:-}" ]; then
    return 0
fi

if [ ! -x /root/minishell-demo.sh ]; then
    return 0
fi

export MINISHELL_PORTFOLIO_STARTED=1
exec /root/minishell-demo.sh