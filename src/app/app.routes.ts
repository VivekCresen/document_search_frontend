import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Register } from './register/register';
import { App } from './app';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'chat', component: App, canActivate: [authGuard] },
];
