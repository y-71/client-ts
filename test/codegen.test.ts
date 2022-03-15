import { join } from 'path';
import { generate } from '../codegen/src/codegen';

describe('codegen', () => {
  it('should generate correct TypeScript', async () => {
    const schemaFilePath = join(__dirname, 'mocks', 'schema.json');
    const outputFilePath = 'hahaha';

    const writeFile = jest.fn();
    await generate({ schemaFilePath, outputFilePath, writeFile });

    // Sorry about this.
    const expectedOutput = `import {
  BaseClient,
  Query,
  Repository,
  RestRespositoryFactory,
  XataClientOptions,
  XataRecord,
} from "@xata.io/client";

export interface Author extends XataRecord {
  name?: string;
  email?: string;
  photoUrl?: string;
  bio?: string;
  title?: string;
}

export interface Post extends XataRecord {
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  likes?: number;
  author?: Author;
  date?: string;
  slug?: string;
  published?: boolean;
}

export interface Person extends XataRecord {
  slug?: string;
  name?: string;
  title?: string;
  photoUrl?: string;
}

const links = { authors: [], posts: [["author", "authors"]], people: [] };

export class XataClient extends BaseClient<{
  authors: Repository<Author>;
  posts: Repository<Post>;
  people: Repository<Person>;
}> {
  constructor(options: XataClientOptions) {
    super(options, links);
    const factory = options.repositoryFactory || new RestRespositoryFactory();
    this.db = {
      authors: factory.createRepository(this, "authors"),
      posts: factory.createRepository(this, "posts"),
      people: factory.createRepository(this, "people"),
    };
  }
}
`;

    const [path, content] = writeFile.mock.calls[0];
    expect(path).toEqual('/Users/tejas/Sites/client-ts/hahaha.ts');
    expect(content).toMatchWithoutWhitespace(expectedOutput);
  });

  it('should generate correct JavaScript', async () => {
    const schemaFilePath = join(__dirname, 'mocks', 'schema.json');
    const outputFilePath = 'hahaha';

    const writeFile = jest.fn();
    await generate({ schemaFilePath, outputFilePath, writeFile: writeFile, language: 'javascript' });

    // Sorry about this.
    const expectedOutput = `/** @typedef { import('@xata.io/client').Repository } Repository */
    import { BaseClient, Query, RestRespositoryFactory } from "@xata.io/client";
    
    /**
     * @typedef {Object} Author
     * @property {string} id
     * @property {Object} xata
     * @property {() => Promise<Author>} read
     * @property {() => Promise<Author>} update
     * @property {() => Promise<void>} delete
     * @property {string=} name
     * @property {string=} email
     * @property {string=} photoUrl
     * @property {string=} bio
     * @property {string=} title
     
     */
    
    /**
     * @typedef {Object} Post
     * @property {string} id
     * @property {Object} xata
     * @property {() => Promise<Post>} read
     * @property {() => Promise<Post>} update
     * @property {() => Promise<void>} delete
     * @property {string=} title
     * @property {string=} summary
     * @property {string=} content
     * @property {string[]=} tags
     * @property {number=} likes
     * @property {Author=} author
     * @property {string=} date
     * @property {string=} slug
     * @property {boolean=} published
     
     */
    
    /**
     * @typedef {Object} Person
     * @property {string} id
     * @property {Object} xata
     * @property {() => Promise<Person>} read
     * @property {() => Promise<Person>} update
     * @property {() => Promise<void>} delete
     * @property {string=} slug
     * @property {string=} name
     * @property {string=} title
     * @property {string=} photoUrl
     
     */
    
    const links = { authors: [], posts: [["author", "authors"]], people: [] };
    
    export class XataClient extends BaseClient {
      constructor(options) {
        super(options, links);
        const factory = options.repositoryFactory || new RestRespositoryFactory();
        /** @type {{ "authors": Repository; "posts": Repository; "people": Repository }} */
        this.db = {
          authors: factory.createRepository(this, "authors"),
          posts: factory.createRepository(this, "posts"),
          people: factory.createRepository(this, "people"),
        };
      }
    }
    `;

    const [path, content] = writeFile.mock.calls[0];
    expect(path).toEqual('/Users/tejas/Sites/client-ts/hahaha.js');
    expect(content).toMatchWithoutWhitespace(expectedOutput);
  });
});
