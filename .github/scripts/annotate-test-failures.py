"""Surface failed .NET tests as GitHub Actions annotations.

The default `dotnet test` output is buried in the job log, which is awkward to
inspect from a PR. Parsing the TRX file and printing `::error::` lines makes CI
report the failing test names (and the first line of the failure message)
directly on the pull request.
"""

from __future__ import annotations

import glob
import sys
import xml.etree.ElementTree as ET

NS = "{http://microsoft.com/schemas/VisualStudio/TeamTest/2010}"


def main() -> int:
    failures = 0

    for path in glob.glob("TestResults/**/*.trx", recursive=True):
        root = ET.parse(path).getroot()

        for result in root.iter(NS + "UnitTestResult"):
            if result.get("outcome") != "Failed":
                continue

            failures += 1
            name = result.get("testName", "unknown test")
            message = result.find(".//" + NS + "Message")
            detail = (message.text or "").strip().splitlines() if message is not None else []
            first = detail[0][:300] if detail else "no message"
            print(f"::error::{name} failed: {first}")

    if failures == 0:
        print("::warning::dotnet test failed but no TRX failures were found")

    return 0


if __name__ == "__main__":
    sys.exit(main())
