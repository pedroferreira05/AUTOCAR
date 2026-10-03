import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export type Atendimento = {
  id: number;
  nome: string;
  carro: string;
  placa: string;
  servico: string;
  data: string;
  horario: string;
  valor: number;
};

export type CategoriaProduto =
  | 'Lavagem Interna'
  | 'Lavagem Externa'
  | 'Vidros'
  | 'Acabamento';

export type CompraProduto = {
  id: number;
  quantidade: number;
  quantidadeDisponivel: number;
  valor: number;
  dataCompra: string;
  dataVencimento: string | null;
  removida: boolean;
};

export type Produto = {
  id: number;
  nome: string;
  categoria: CategoriaProduto;
  foto: string | null;
  compras: CompraProduto[];
  removido: boolean;
};

export type Usuario = {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
};

type NovoProduto = {
  nome: string;
  categoria: CategoriaProduto;
  foto: string | null;
  quantidade: number;
  valor: number;
  dataCompra: string;
  dataVencimento: string | null;
};

type NovaCompraProduto = Omit<
  NovoProduto,
  'nome' | 'categoria' | 'foto'
>;

type NovoUsuario = {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
};

type DadosPersistidos = {
  versao: 2;
  usuarioCadastrado: Usuario | null;
  atendimentos: Atendimento[];
  produtos: Produto[];
};

type AppDataContextType = {
  atendimentos: Atendimento[];
  produtos: Produto[];
  adicionarAtendimento: (atendimento: Atendimento) => Promise<void>;
  cadastrarProduto: (dados: NovoProduto) => Promise<void>;
  adicionarCompraProduto: (
    produtoId: number,
    dados: NovaCompraProduto
  ) => Promise<void>;
  retirarUnidadesProduto: (
    produtoId: number,
    compraId: number,
    quantidade: number
  ) => Promise<void>;
  excluirProdutoDoEstoque: (produtoId: number) => Promise<void>;
  excluirCompraDoEstoque: (
    produtoId: number,
    compraId: number
  ) => Promise<void>;
  usuarioCadastrado: Usuario | null;
  usuarioLogado: Usuario | null;
  cadastrarUsuario: (dados: NovoUsuario) => Promise<boolean>;
  entrarUsuario: (email: string, senha: string) => Promise<boolean>;
  sairUsuario: () => void;
  emailPertenceAoUsuario: (email: string) => boolean;
};

const CHAVE_DADOS = '@autocar/dados-offline-v1';
const CHAVE_SENHA = 'autocar-senha-administrador-v1';

const DADOS_INICIAIS: DadosPersistidos = {
  versao: 2,
  usuarioCadastrado: null,
  atendimentos: [],
  produtos: [],
};

const AppDataContext = createContext<AppDataContextType | undefined>(
  undefined
);

function normalizarEmail(email: string) {
  return email.trim().toLowerCase().normalize('NFKC');
}

function normalizarNome(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR');
}

function gerarProximoId(ids: number[]) {
  const maiorId = ids.reduce(
    (maior, id) => (Number.isFinite(id) && id > maior ? id : maior),
    0
  );

  return Math.max(Date.now(), maiorId + 1);
}

function numeroValido(valor: unknown, padrao = 0) {
  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : padrao;
}

function normalizarCompraSalva(valor: unknown): CompraProduto | null {
  if (!valor || typeof valor !== 'object') {
    return null;
  }

  const compra = valor as Partial<CompraProduto>;
  const quantidade = Math.max(0, numeroValido(compra.quantidade));
  const removida = compra.removida === true;
  const quantidadeDisponivelInformada = numeroValido(
    compra.quantidadeDisponivel,
    quantidade
  );
  const quantidadeDisponivel = removida
    ? 0
    : Math.min(
        quantidade,
        Math.max(0, quantidadeDisponivelInformada)
      );

  return {
    id: numeroValido(compra.id, Date.now()),
    quantidade,
    quantidadeDisponivel,
    valor: Math.max(0, numeroValido(compra.valor)),
    dataCompra:
      typeof compra.dataCompra === 'string' ? compra.dataCompra : '',
    dataVencimento:
      typeof compra.dataVencimento === 'string'
        ? compra.dataVencimento
        : null,
    removida,
  };
}

function normalizarProdutoSalvo(valor: unknown): Produto | null {
  if (!valor || typeof valor !== 'object') {
    return null;
  }

  const produto = valor as Partial<Produto>;
  const compras = Array.isArray(produto.compras)
    ? produto.compras
        .map(normalizarCompraSalva)
        .filter((compra): compra is CompraProduto => compra !== null)
    : [];

  return {
    id: numeroValido(produto.id, Date.now()),
    nome: typeof produto.nome === 'string' ? produto.nome : 'Produto',
    categoria: produto.categoria ?? 'Acabamento',
    foto: typeof produto.foto === 'string' ? produto.foto : null,
    compras,
    removido: produto.removido === true,
  };
}

function normalizarDadosSalvos(valor: unknown): DadosPersistidos {
  if (!valor || typeof valor !== 'object') {
    return DADOS_INICIAIS;
  }

  const dados = valor as Partial<DadosPersistidos>;

  return {
    versao: 2,
    usuarioCadastrado: dados.usuarioCadastrado ?? null,
    atendimentos: Array.isArray(dados.atendimentos)
      ? dados.atendimentos
      : [],
    produtos: Array.isArray(dados.produtos)
      ? dados.produtos
          .map(normalizarProdutoSalvo)
          .filter((produto): produto is Produto => produto !== null)
      : [],
  };
}

function converterDataBrasileira(dataTexto: string | null) {
  if (!dataTexto) {
    return null;
  }

  const [dia, mes, ano] = dataTexto.split('/').map(Number);
  const data = new Date(ano, mes - 1, dia);

  if (
    !Number.isFinite(dia) ||
    !Number.isFinite(mes) ||
    !Number.isFinite(ano) ||
    data.getDate() !== dia ||
    data.getMonth() !== mes - 1 ||
    data.getFullYear() !== ano
  ) {
    return null;
  }

  data.setHours(0, 0, 0, 0);
  return data;
}

function compraEstaVencida(compra: CompraProduto) {
  const vencimento = converterDataBrasileira(compra.dataVencimento);

  if (!vencimento) {
    return false;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return vencimento.getTime() < hoje.getTime();
}

async function copiarFotoParaAreaPermanente(uri: string | null) {
  if (!uri) {
    return null;
  }

  if (uri.startsWith(Paths.document.uri)) {
    return uri;
  }

  const origem = new File(uri);

  if (!origem.exists) {
    throw new Error('A imagem selecionada não foi encontrada no aparelho.');
  }

  const pastaFotos = new Directory(Paths.document, 'imagens-produtos');
  pastaFotos.create({
    idempotent: true,
    intermediates: true,
  });

  const extensao = origem.extension || '.jpg';
  const nomeArquivo = `produto-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}${extensao}`;
  const destino = new File(pastaFotos, nomeArquivo);

  origem.copy(destino);

  return destino.uri;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [usuarioCadastrado, setUsuarioCadastrado] =
    useState<Usuario | null>(null);
  const [usuarioLogado, setUsuarioLogado] = useState<Usuario | null>(null);

  const dadosRef = useRef<DadosPersistidos>(DADOS_INICIAIS);
  const carregamentoRef = useRef<Promise<void> | null>(null);

  function aplicarDados(dados: DadosPersistidos) {
    dadosRef.current = dados;
    setUsuarioCadastrado(dados.usuarioCadastrado);
    setAtendimentos(dados.atendimentos);
    setProdutos(dados.produtos);
  }

  async function persistirDados(dados: DadosPersistidos) {
    await AsyncStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
    aplicarDados(dados);
  }

  async function aguardarCarregamento() {
    if (carregamentoRef.current) {
      await carregamentoRef.current;
    }
  }

  useEffect(() => {
    let componenteAtivo = true;

    const carregamento = (async () => {
      try {
        const textoSalvo = await AsyncStorage.getItem(CHAVE_DADOS);
        const dadosSalvos = textoSalvo
          ? normalizarDadosSalvos(JSON.parse(textoSalvo))
          : DADOS_INICIAIS;

        if (componenteAtivo) {
          aplicarDados(dadosSalvos);
        }
      } catch (erro) {
        console.error('Erro ao carregar os dados locais do AUTOCAR:', erro);

        if (componenteAtivo) {
          aplicarDados(DADOS_INICIAIS);
        }
      }
    })();

    carregamentoRef.current = carregamento;

    return () => {
      componenteAtivo = false;
    };
  }, []);

  async function adicionarAtendimento(atendimento: Atendimento) {
    await aguardarCarregamento();

    const idsExistentes = dadosRef.current.atendimentos.map(
      (item) => item.id
    );
    const idInformado = Number(atendimento.id);
    const idValido =
      Number.isFinite(idInformado) && !idsExistentes.includes(idInformado);

    const novoAtendimento: Atendimento = {
      ...atendimento,
      id: idValido ? idInformado : gerarProximoId(idsExistentes),
      nome: atendimento.nome.trim(),
      carro: atendimento.carro.trim(),
      placa: atendimento.placa.trim().toUpperCase(),
      servico: atendimento.servico.trim(),
      valor: Number(atendimento.valor),
    };

    await persistirDados({
      ...dadosRef.current,
      atendimentos: [novoAtendimento, ...dadosRef.current.atendimentos],
    });
  }

  function criarCompra(
    dados: NovaCompraProduto,
    produtosAtuais: Produto[]
  ): CompraProduto {
    const quantidade = Number(dados.quantidade);
    const valor = Number(dados.valor);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error('Informe uma quantidade maior que zero.');
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error('Informe um valor de compra válido.');
    }

    const idsCompras = produtosAtuais.flatMap((produto) =>
      produto.compras.map((compra) => compra.id)
    );

    return {
      id: gerarProximoId(idsCompras),
      quantidade,
      quantidadeDisponivel: quantidade,
      valor,
      dataCompra: dados.dataCompra,
      dataVencimento: dados.dataVencimento,
      removida: false,
    };
  }

  async function cadastrarProduto(dados: NovoProduto) {
    await aguardarCarregamento();

    const estadoAtual = dadosRef.current;
    const produtosAtuais = estadoAtual.produtos;
    const produtoDuplicado = produtosAtuais.some(
      (produto) =>
        !produto.removido &&
        normalizarNome(produto.nome) === normalizarNome(dados.nome)
    );

    if (produtoDuplicado) {
      throw new Error(
        'Este produto já está cadastrado. Use “Adicionar unidades” na lista de produtos.'
      );
    }

    const novaCompra = criarCompra(dados, produtosAtuais);
    const idsProdutos = produtosAtuais.map((produto) => produto.id);
    const fotoPermanente = await copiarFotoParaAreaPermanente(dados.foto);
    const novoProduto: Produto = {
      id: gerarProximoId(idsProdutos),
      nome: dados.nome.trim(),
      categoria: dados.categoria,
      foto: fotoPermanente,
      compras: [novaCompra],
      removido: false,
    };

    const novosProdutos = [novoProduto, ...produtosAtuais].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR')
    );

    await persistirDados({
      ...estadoAtual,
      produtos: novosProdutos,
    });
  }

  async function adicionarCompraProduto(
    produtoId: number,
    dados: NovaCompraProduto
  ) {
    await aguardarCarregamento();

    const estadoAtual = dadosRef.current;
    const produtosAtuais = estadoAtual.produtos;
    const produto = produtosAtuais.find(
      (item) => item.id === produtoId && !item.removido
    );

    if (!produto) {
      throw new Error('Produto não encontrado no estoque.');
    }

    const novaCompra = criarCompra(dados, produtosAtuais);
    const novosProdutos = produtosAtuais.map((item) =>
      item.id === produtoId
        ? {
            ...item,
            compras: [novaCompra, ...item.compras],
          }
        : item
    );

    await persistirDados({
      ...estadoAtual,
      produtos: novosProdutos,
    });
  }

  async function retirarUnidadesProduto(
    produtoId: number,
    compraId: number,
    quantidade: number
  ) {
    await aguardarCarregamento();

    const quantidadeSolicitada = Number(quantidade);

    if (!Number.isFinite(quantidadeSolicitada) || quantidadeSolicitada <= 0) {
      throw new Error('Informe uma quantidade maior que zero.');
    }

    const estadoAtual = dadosRef.current;
    const produto = estadoAtual.produtos.find(
      (item) => item.id === produtoId && !item.removido
    );

    if (!produto) {
      throw new Error('Produto não encontrado no estoque.');
    }

    const compraSelecionada = produto.compras.find(
      (compra) =>
        compra.id === compraId &&
        !compra.removida &&
        !compraEstaVencida(compra) &&
        Number(compra.quantidadeDisponivel) > 0
    );

    if (!compraSelecionada) {
      throw new Error(
        'A compra escolhida não está disponível para retirada.'
      );
    }

    const quantidadeDisponivel = Number(
      compraSelecionada.quantidadeDisponivel
    );

    if (quantidadeSolicitada > quantidadeDisponivel) {
      throw new Error(
        `Quantidade indisponível nesta compra. Ela possui ${quantidadeDisponivel} ${
          quantidadeDisponivel === 1 ? 'unidade' : 'unidades'
        }.`
      );
    }

    const novasCompras = produto.compras.map((compra) =>
      compra.id === compraId
        ? {
            ...compra,
            quantidadeDisponivel: Math.max(
              0,
              Math.round(
                (Number(compra.quantidadeDisponivel) - quantidadeSolicitada) *
                  1000
              ) / 1000
            ),
          }
        : compra
    );

    await persistirDados({
      ...estadoAtual,
      produtos: estadoAtual.produtos.map((item) =>
        item.id === produtoId
          ? {
              ...item,
              compras: novasCompras,
            }
          : item
      ),
    });
  }

  async function excluirProdutoDoEstoque(produtoId: number) {
    await aguardarCarregamento();

    const produtoExiste = dadosRef.current.produtos.some(
      (produto) => produto.id === produtoId
    );

    if (!produtoExiste) {
      throw new Error('Produto não encontrado.');
    }

    await persistirDados({
      ...dadosRef.current,
      produtos: dadosRef.current.produtos.map((produto) =>
        produto.id === produtoId ? { ...produto, removido: true } : produto
      ),
    });
  }

  async function excluirCompraDoEstoque(
    produtoId: number,
    compraId: number
  ) {
    await aguardarCarregamento();

    const produto = dadosRef.current.produtos.find(
      (item) => item.id === produtoId
    );
    const compraExiste = produto?.compras.some(
      (compra) => compra.id === compraId
    );

    if (!produto || !compraExiste) {
      throw new Error('Compra não encontrada.');
    }

    const novosProdutos = dadosRef.current.produtos.map((item) => {
      if (item.id !== produtoId) {
        return item;
      }

      const novasCompras = item.compras.map((compra) =>
        compra.id === compraId
          ? {
              ...compra,
              quantidadeDisponivel: 0,
              removida: true,
            }
          : compra
      );
      const possuiCompraVisivel = novasCompras.some(
        (compra) => !compra.removida
      );

      return {
        ...item,
        compras: novasCompras,
        removido: possuiCompraVisivel ? item.removido : true,
      };
    });

    await persistirDados({
      ...dadosRef.current,
      produtos: novosProdutos,
    });
  }

  async function cadastrarUsuario(dados: NovoUsuario) {
    await aguardarCarregamento();

    if (dadosRef.current.usuarioCadastrado) {
      return false;
    }

    const novoUsuario: Usuario = {
      id: gerarProximoId([]),
      nome: dados.nome.trim(),
      sobrenome: dados.sobrenome.trim(),
      email: normalizarEmail(dados.email),
    };

    await SecureStore.setItemAsync(CHAVE_SENHA, dados.senha);

    try {
      await persistirDados({
        ...dadosRef.current,
        usuarioCadastrado: novoUsuario,
      });
    } catch (erro) {
      await SecureStore.deleteItemAsync(CHAVE_SENHA);
      throw erro;
    }

    return true;
  }

  async function entrarUsuario(email: string, senha: string) {
    await aguardarCarregamento();

    const usuario = dadosRef.current.usuarioCadastrado;

    if (!usuario || normalizarEmail(email) !== usuario.email) {
      return false;
    }

    const senhaSalva = await SecureStore.getItemAsync(CHAVE_SENHA);

    if (!senhaSalva || senha !== senhaSalva) {
      return false;
    }

    setUsuarioLogado(usuario);
    return true;
  }

  function sairUsuario() {
    setUsuarioLogado(null);
  }

  function emailPertenceAoUsuario(email: string) {
    const usuario = dadosRef.current.usuarioCadastrado;

    return !!usuario && usuario.email === normalizarEmail(email);
  }

  return (
    <AppDataContext.Provider
      value={{
        atendimentos,
        produtos,
        adicionarAtendimento,
        cadastrarProduto,
        adicionarCompraProduto,
        retirarUnidadesProduto,
        excluirProdutoDoEstoque,
        excluirCompraDoEstoque,
        usuarioCadastrado,
        usuarioLogado,
        cadastrarUsuario,
        entrarUsuario,
        sairUsuario,
        emailPertenceAoUsuario,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData deve ser usado dentro de AppDataProvider');
  }

  return context;
}
