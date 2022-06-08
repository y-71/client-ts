import { BaseCommand } from '../../base.js';
export default class BranchesList extends BaseCommand {
  static description = 'List branches';

  static examples = [];

  static flags = {
    ...this.commonFlags,
    databaseURL: this.databaseURLFlag
  };

  static args = [];

  static enableJsonFlag = true;

  async run(): Promise<any> {
    const { flags } = await this.parse(BranchesList);
    const { workspace, database } = await this.getParsedDatabaseURL(flags.databaseURL);

    const xata = await this.getXataClient();
    const { branches } = await xata.branches.getBranchList(workspace, database);
    const { mapping } = await xata.databases.getGitBranchesMapping(workspace, database);

    if (this.jsonEnabled()) return { branches, mapping };

    const rows = branches.map((b) => [
      b.name,
      this.formatDate(b.createdAt),
      mapping.find(({ xataBranch }) => xataBranch === b.name)?.gitBranch ?? '-'
    ]);

    this.printTable(['Name', 'Created at', 'Git branch'], rows);
  }
}
