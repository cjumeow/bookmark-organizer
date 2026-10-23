#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
cp "$(dirname "$0")/../simulate-tools.mjs" .
