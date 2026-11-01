# Reproduce the reference retrieval case

Create a fresh neutral temporary directory outside an armed repository. Copy the
skill folder to skills/clone-odo. Copy inputs/recon.md and features.csv into
project/.skillator/clone/ and inputs/TICKETS.md into project/TICKETS.md. Run
scenario-clone-odo-workflow-contracts.txt on a fresh agent with commands explicitly
using that working directory, no global/project skills or upstream access.
The archived RED used clone-odo from0f20f7d; GREEN uses this integration. Use the
same model/effort (gpt-6-astra/medium) when comparing. Models are nondeterministic;
reported results are individual actual runs, not a reliability rate.

Review stage-contracts.md and retrieval-result.json against actual source citations.
A full contract is inputs, required artifacts, execution owner and evidence gate.
Blocked fixture research/build/account operations are not missing pack contracts.
Generated scaffolds are planning evidence, never a migrated DB or live release.
