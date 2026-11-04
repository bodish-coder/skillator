#!/bin/sh
# Runnable selftest for reconcile.sh (ticket A192)
# Tests: missing refs, invalid objects, failed enumeration,
# unchanged, normal edit, rename, deletion, binary, and missing-change failure.
set -e

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
reconcile_sh="$here/reconcile.sh"

die() { echo "FAIL: $1" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q
git config user.name "Tester"
git config user.email "tester@example.com"
git config commit.gpgSign false

# 1. Missing ref (first arg)
out=$( ( . "$reconcile_sh" && reconcile NONEXISTENT HEAD ) 2>&1 ) && rc=0 || rc=$?
[ "$rc" -ne 0 ] || die "expected nonzero for missing ref 1, got 0"
case "$out" in
  *"0 paths, 0 failed"*) die "missing ref 1 claimed 0 paths, 0 failed: $out" ;;
esac

# 2. Missing ref (second arg)
out=$( ( . "$reconcile_sh" && reconcile HEAD NONEXISTENT ) 2>&1 ) && rc=0 || rc=$?
[ "$rc" -ne 0 ] || die "expected nonzero for missing ref 2, got 0"
case "$out" in
  *"0 paths, 0 failed"*) die "missing ref 2 claimed 0 paths, 0 failed: $out" ;;
esac

# 3. Invalid object (40-hex nonexistent SHA)
out=$( ( . "$reconcile_sh" && reconcile 0000000000000000000000000000000000000000 HEAD ) 2>&1 ) && rc=0 || rc=$?
[ "$rc" -ne 0 ] || die "expected nonzero for invalid object, got 0"
case "$out" in
  *"0 paths, 0 failed"*) die "invalid object claimed 0 paths, 0 failed: $out" ;;
esac

# 4. Missing arguments
out=$( ( . "$reconcile_sh" && reconcile ) 2>&1 ) && rc=0 || rc=$?
[ "$rc" -ne 0 ] || die "expected nonzero for missing args, got 0"
case "$out" in
  *"0 paths, 0 failed"*) die "missing args claimed 0 paths, 0 failed: $out" ;;
esac

# Create base commit
echo "initial" > base.txt
echo "to_delete" > delete.txt
echo "to_rename" > rename_old.txt
printf '\000\001\002\003' > binary.bin
git add base.txt delete.txt rename_old.txt binary.bin
git commit -qm "c0"
c0=$(git rev-parse HEAD)

# 4b. Failed git diff enumeration with valid refs (stubbed git returning 128 on diff)
(
  bin="$tmp/fakebin"
  mkdir -p "$bin"
  real_git=$(which git)
  cat > "$bin/git" <<EOF
#!/bin/sh
for arg in "\$@"; do
  if [ "\$arg" = "diff" ]; then
    echo "fatal: simulated diff enumeration failure" >&2
    exit 128
  fi
done
exec "$real_git" "\$@"
EOF
  chmod +x "$bin/git"
  PATH="$bin:$PATH"
  out=$( ( . "$reconcile_sh" && reconcile "$c0" "$c0" ) 2>&1 ) && rc=0 || rc=$?
  [ "$rc" -eq 128 ] || die "expected diff failure exit 128, got $rc"
  case "$out" in
    *"0 paths, 0 failed"*) die "failed enumeration claimed 0 paths, 0 failed: $out" ;;
  esac
)

# 5. Valid unchanged (HEAD against HEAD)
out=$( . "$reconcile_sh" && reconcile "$c0" "$c0" )
[ $? -eq 0 ] || die "valid unchanged should exit 0"
case "$out" in
  *"0 paths, 0 failed"*) ;;
  *) die "valid unchanged should report 0 paths, 0 failed: $out" ;;
esac

# Create change commit on feature branch
git checkout -qb feature
echo "initial edit" > base.txt
rm delete.txt
git rm -q delete.txt
mv rename_old.txt rename_new.txt
echo "renamed and edited" > rename_new.txt
printf '\000\001\002\004' > binary.bin
git add base.txt rename_new.txt binary.bin
git commit -qm "c1"
c1=$(git rev-parse HEAD)

# Switch back to main, fast-forward or bring working tree to c1 state
git checkout -q master 2>/dev/null || git checkout -q main
git merge -q --ff-only feature

# 6. Valid edits (unchanged working tree with edit, rename, deletion, binary)
out=$( . "$reconcile_sh" && reconcile "$c0" "$c1" )
[ $? -eq 0 ] || die "valid feature changes against HEAD should exit 0"
case "$out" in
  *"4 paths, 0 failed"*) ;;
  *) die "expected 4 paths, 0 failed, got: $out" ;;
esac

# 7. Missing change in HEAD (should report failure)
# Revert base.txt in HEAD and check that reconcile fails
git checkout -q "$c0" -- base.txt
git commit -qm "revert base.txt"
out=$( ( . "$reconcile_sh" && reconcile "$c0" "$c1" ) 2>&1 ) && rc=0 || rc=$?
[ "$rc" -ne 0 ] || die "expected nonzero when change missing from HEAD"
case "$out" in
  *"FAIL "*base.txt*) ;;
  *) die "expected FAIL for base.txt, got: $out" ;;
esac
case "$out" in
  *"1 failed"*) ;;
  *) die "expected '1 failed', got: $out" ;;
esac

echo "ok"
