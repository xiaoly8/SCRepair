SCRepair
===

The first automated smart contract gas-optimized vulnerability repair tool. SCRepair can automatically generate patches fixing vulnerabilities while attempt to keep the test cases passing.

Current implementation supports Slither and Oyente as vulnerability detector.

To Use
===

Use the following command

```Bash
python3 CLI.py repair PATH_TO_CONTRACT
```

You also need to configure the detectors intended to be used via the `--detector` flag.

Publication
===

Smart Contract Repair on Arxiv (Pending)

Experiment Replication
===

See Experiments/Readme.md

People
===

Abhik Roychoudhury, Pricipal Investigator

Developed by Xiao Liang <xiaoly@comp.nus.edu.sg>
