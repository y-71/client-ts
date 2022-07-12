import prettier, { BuiltInParserName } from 'prettier';
import * as parserJavascript from 'prettier/parser-babel.js';
import * as parserTypeScript from 'prettier/parser-typescript.js';
import ts from 'typescript';
import { XataDatabaseSchema } from './schema';

export type GenerateOptions = {
  schema: XataDatabaseSchema;
  databaseURL: string;
  language: Language;
  javascriptTarget?: JavascriptTarget;
};

export type GenerateOutput = {
  original: string;
  transpiled: string;
  declarations?: string;
};

export type Language = 'typescript' | 'javascript';
export type JavascriptTarget = keyof typeof ts.ScriptTarget | undefined;

export async function generate({
  schema,
  databaseURL,
  language,
  javascriptTarget
}: GenerateOptions): Promise<GenerateOutput> {
  const { tables } = schema;

  const parser = prettierParsers[language];

  const code = `
    import { BaseClientOptions, buildClient, SchemaInference } from '@xata.io/client';

    ${
      language === 'javascript'
        ? `/** @typedef { import('./types').SchemaTables } SchemaTables */
           /** @type { SchemaTables } */`
        : ''
    }
    const tables = ${JSON.stringify(tables)} as const;

    export type SchemaTables = typeof tables;
    export type DatabaseSchema = SchemaInference<SchemaTables>;

    export type TeamRecord = DatabaseSchema['teams'];
    export type UserRecord = DatabaseSchema['users'];

    ${language === 'javascript' ? `/** @type { import('@xata.io/client').ClientConstructor<{}> } */` : ''}
    const DatabaseClient = buildClient();

    ${language === 'javascript' ? `/** @extends DatabaseClient<SchemaTables> */` : ''}
    export class XataClient extends DatabaseClient<SchemaTables> {
      constructor(options?: BaseClientOptions) {
        super({ databaseURL: "${databaseURL}", ...options}, tables);
      }
    }
  `;

  const transpiled = transpile(code, language, javascriptTarget);
  const declarations = emitDeclarations(code);

  const pretty = prettier.format(transpiled, { parser, plugins: [parserTypeScript, parserJavascript] });

  const prettyDeclarations = declarations
    ? prettier.format(declarations, { parser: 'typescript', plugins: [parserTypeScript] })
    : undefined;

  return { original: code, transpiled: pretty, declarations: prettyDeclarations };
}

const prettierParsers: Record<Language, BuiltInParserName> = {
  typescript: 'typescript',
  javascript: 'babel'
};

function transpile(code: string, language: Language, javascriptTarget: JavascriptTarget = 'ES2020') {
  switch (language) {
    case 'typescript':
      return code;
    case 'javascript':
      return ts.transpile(code, { target: ts.ScriptTarget[javascriptTarget] });
  }
}

function emitDeclarations(code: string) {
  const files = new Map<string, string>();
  const inputFileName = 'index.ts';
  const sourceFile = ts.createSourceFile(inputFileName, code, ts.ScriptTarget.ESNext);

  const compilerHost = {
    getSourceFile: (fileName: string) => (fileName === inputFileName ? sourceFile : undefined),
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    writeFile: (_name: string, _text: string) => {},
    getDefaultLibFileName: () => 'lib.d.ts',
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (fileName: string) => fileName,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n',
    fileExists: (fileName: string) => fileName === inputFileName,
    readFile: () => '',
    directoryExists: () => true,
    getDirectories: () => []
  };

  const program = ts.createProgram(
    ['index.ts'],
    { declaration: true, emitDeclarationOnly: true, removeComments: true },
    compilerHost
  );
  program.emit(undefined, (fileName, data) => files.set(fileName, data), undefined, true);

  return files.get('index.d.ts');
}
