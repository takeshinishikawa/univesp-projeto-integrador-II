import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { loginSchema, registrarUsuarioSchema } from '../types';

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  registrar = async (req: Request, res: Response): Promise<void> => {
    const dto = registrarUsuarioSchema.parse(req.body);
    res.status(201).json(await this.auth.registrar(dto));
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const dto = loginSchema.parse(req.body);
    res.status(200).json(await this.auth.login(dto));
  };
}
