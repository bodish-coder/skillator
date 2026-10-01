# reconcile.sh - the per-hunk reconcile shared by merge-smith and mergeprep-oracle.
# Source it from sh/bash, then:  reconcile FROM TO
#
# Checks that every change FROM..TO is present in the checked-out HEAD, path by
# path, with nothing sampled. Enumerated with `git diff --raw -M`, so:
#   - a rename is checked under BOTH paths (old gone, new carries the edit);
#   - a deletion is checked (the file must be gone);
#   - a submodule is compared by commit (apply --check passes any gitlink);
#   - every other path goes through `git diff --binary | git apply --reverse --check`.
# Prints `FAIL <status> <path>` per path whose hunks are not all present, then a
# count line. Exit 0 only when nothing failed. Run on a CLEAN tree: a dirty or
# untracked file on a checked path corrupts its `apply --check`. The relay run
# file (.skillator/run-*.md) is the one allowed dirty path - it is never checked.
reconcile() {
  git -c core.quotepath=off diff --raw --no-abbrev -M "$1" "$2" | {
    from=$1 to=$2 n=0 bad=0 tab=$(printf '\t')
    while IFS=$tab read -r meta p1 p2; do
      n=$((n+1)); set -- $meta                 # :omode nmode osha nsha status
      if [ "$1" = :160000 ] || [ "$2" = 160000 ]; then      # submodule: compare commits
        want=$4; [ "$2" = 000000 ] && want=
        [ "$(git rev-parse -q --verify "HEAD:${p2:-$p1}")" = "$want" ] && continue
      else                                     # file: every hunk, both rename paths
        git diff --binary -M "$from" "$to" -- "$p1" ${p2:+"$p2"} |
          git apply --reverse --check 2>/dev/null && continue
      fi
      bad=$((bad+1)); echo "FAIL $5 $p1${p2:+ -> $p2}"
    done
    echo "reconcile $from..$to: $n paths, $bad failed"; [ "$bad" -eq 0 ]
  }
}
