#!/bin/bash

BOX_ID=""
IS_INIT=0
IS_CLEANUP=0
IS_RUN=0
RUN_INDEX=0

ARGS=("$@")
N=${#ARGS[@]}

for (( i=0; i<N; i++ )); do
  arg="${ARGS[$i]}"
  case "$arg" in
    --box-id=*)
      BOX_ID="${arg#*=}"
      ;;
    -b)
      BOX_ID="${ARGS[$((i+1))]}"
      ;;
    --init)
      IS_INIT=1
      ;;
    --cleanup)
      IS_CLEANUP=1
      ;;
    --run|--run-quiet|--run-verbose)
      IS_RUN=1
      RUN_INDEX=$((i+1))
      break
      ;;
  esac
done

if [ -z "$BOX_ID" ]; then
  BOX_ID="0"
fi

WORK_DIR="/box/$BOX_ID"
BOX_DIR="/box/$BOX_ID/box"

if [ $IS_INIT -eq 1 ]; then
  mkdir -p "$BOX_DIR"
  chmod -R 777 "$WORK_DIR"
  echo "$WORK_DIR"
  exit 0
fi

if [ $IS_CLEANUP -eq 1 ]; then
  rm -rf "$WORK_DIR"
  exit 0
fi

if [ $IS_RUN -eq 1 ]; then
  mkdir -p "$BOX_DIR"
  cd "$BOX_DIR"

  shift $RUN_INDEX
  while [[ $# -gt 0 ]]; do
    if [ "$1" = "--" ]; then
      shift
      continue
    fi
    if [[ "$1" == --* ]]; then
      shift
      continue
    fi
    break
  done

  exec "$@"
fi
