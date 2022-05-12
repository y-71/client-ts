import { XataApiClient } from '../../../../client/src';
import { XataClient } from '../../../../codegen/example/xata';
import { teamColumns, userColumns } from '../../../mock_data';

export default {
  async fetch(_request: Request, env: Record<string, string>): Promise<Response> {
    const { XATA_WORKSPACE: workspace, XATA_API_KEY: apiKey } = env;

    const api = new XataApiClient({ apiKey });

    const id = Math.round(Math.random() * 100000);

    const { databaseName } = await api.databases.createDatabase(workspace, `sdk-e2e-test-${id}`);

    await api.tables.createTable(workspace, databaseName, 'main', 'teams');
    await api.tables.createTable(workspace, databaseName, 'main', 'users');
    await api.tables.setTableSchema(workspace, databaseName, 'main', 'teams', { columns: teamColumns });
    await api.tables.setTableSchema(workspace, databaseName, 'main', 'users', { columns: userColumns });

    const xata = new XataClient({
      databaseURL: `https://${workspace}.xata.sh/db/${databaseName}`,
      branch: 'main',
      apiKey
    });

    const team = await xata.db.teams.create({ name: 'Team 1' });
    await xata.db.users.create({ full_name: 'User 1', team });

    const users = await xata.db.users.getMany();
    const teams = await xata.db.teams.getMany();

    await api.databases.deleteDatabase(workspace, databaseName);

    return new Response(JSON.stringify({ users, teams }));
  }
};
