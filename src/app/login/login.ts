import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html'
})
export class Login {
  username = signal('');
  password = signal('');
  error    = signal('');
  loading  = signal(false);

  constructor(private router: Router, private api: ApiService) {}

  login() {
    if (!this.username().trim() || !this.password().trim()) {
      this.error.set('Please enter email and password.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.login({ userNameOrEmail: this.username(), password: this.password() }).subscribe({
      next: (res) => {
        this.loading.set(false);
        localStorage.setItem('ds_current_user', res.userName ?? res.email ?? this.username());
        if (res.token) localStorage.setItem('ds_token', res.token);
        if (res.id) localStorage.setItem('ds_user_id', res.id);
        this.router.navigate(['/chat']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Invalid email or password.');
      }
    });
  }
}
