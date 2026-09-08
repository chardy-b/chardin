"""Linux child subreaper: retain ownership even when tools create new sessions.

No third-party modules. The Node wrapper owns this process group; this supervisor
adopts orphaned descendants, forwards cancellation and reaps them before exit.
"""

import ctypes
import errno
import glob
import json
import os
import signal
import subprocess
import sys
import time


def main():
    command = json.loads(sys.argv[1])
    grace = float(sys.argv[2]) / 1000
    parent = int(sys.argv[3])
    cancelled = False

    def cancel(_signal, _frame):
        nonlocal cancelled
        cancelled = True

    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)
    libc = ctypes.CDLL(None, use_errno=True)
    # PR_SET_CHILD_SUBREAPER, PR_SET_PDEATHSIG. A wrapper SIGKILL still leaves
    # incomplete evidence, but this independent owner can clean up its children.
    if libc.prctl(36, 1, 0, 0, 0) or libc.prctl(1, signal.SIGTERM, 0, 0, 0):
        raise OSError(ctypes.get_errno(), "Unable to establish child ownership")
    if os.getppid() != parent:
        cancelled = True  # Close the parent-death race before any command spawn.

    def report(value):
        os.write(3, (json.dumps(value) + "\n").encode())

    if cancelled:
        report({"code": None, "signal": "SIGTERM", "spawnError": None})
        return 143
    try:
        child = subprocess.Popen(command, close_fds=True)
    except OSError as error:
        report({"code": None, "signal": None, "spawnError": errno.errorcode.get(error.errno, "spawn failed")})
        return 1
    report({"pid": child.pid})
    primary = None
    stopping = None
    termed = set()

    def descendants(pid):
        found = set()
        for path in glob.glob(f"/proc/{pid}/task/*/children"):
            try:
                with open(path, encoding="ascii") as source:
                    found.update(int(value) for value in source.read().split())
            except FileNotFoundError:
                pass
        for descendant in list(found):
            found.update(descendants(descendant))
        return found

    while True:
        no_children = False
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                no_children = True
                break
            if pid == 0:
                break
            if pid == child.pid:
                primary = os.waitstatus_to_exitcode(status)
                child.returncode = primary
        if no_children:
            break
        if (cancelled or primary is not None) and stopping is None:
            stopping = time.monotonic()
        if stopping is not None:
            force = time.monotonic() - stopping >= grace
            # Orphans reparent here, including double-forked/setsid descendants.
            # Repeat until waitpid reports ECHILD, not merely until pipes close.
            for pid in descendants(os.getpid()):
                if force or pid not in termed:
                    try:
                        os.kill(pid, signal.SIGKILL if force else signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    termed.add(pid)
        time.sleep(0.01)
    report({
        "code": primary if primary is not None and primary >= 0 else None,
        "signal": signal.Signals(-primary).name if primary is not None and primary < 0 else None,
        "spawnError": None,
    })
    return primary if primary is not None and primary >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
