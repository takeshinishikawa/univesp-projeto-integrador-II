import { Routes } from '@angular/router';
import { authGuard, visitanteGuard } from './core/guards/auth.guard';

const SUFIXO_TITULO = 'Finanças Pessoais';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    canActivate: [visitanteGuard],
    title: `Entrar | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    canActivate: [visitanteGuard],
    title: `Criar conta | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/auth/registro/registro').then((m) => m.Registro),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    title: `Resumo | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'transacoes',
    canActivate: [authGuard],
    title: `Transações | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/transacoes/transacoes').then((m) => m.Transacoes),
  },
  {
    path: 'importar',
    canActivate: [authGuard],
    title: `Importar extrato | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/importacao/importacao').then((m) => m.Importacao),
  },
  {
    path: 'metas',
    canActivate: [authGuard],
    title: `Metas | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/metas/metas').then((m) => m.Metas),
  },
  {
    path: 'categorias',
    canActivate: [authGuard],
    title: `Categorias | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/categorias/categorias').then((m) => m.Categorias),
  },
  {
    path: 'contas',
    canActivate: [authGuard],
    title: `Contas | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/contas/contas').then((m) => m.Contas),
  },
  {
    path: 'recorrentes',
    canActivate: [authGuard],
    title: `Recorrentes | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/recorrentes/recorrentes').then((m) => m.Recorrentes),
  },
  {
    path: 'objetivos',
    canActivate: [authGuard],
    title: `Objetivos | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/objetivos/objetivos').then((m) => m.Objetivos),
  },
  {
    path: 'minha-conta',
    canActivate: [authGuard],
    title: `Minha conta | ${SUFIXO_TITULO}`,
    loadComponent: () => import('./features/minha-conta/minha-conta').then((m) => m.MinhaConta),
  },
  { path: '**', redirectTo: 'dashboard' },
];
